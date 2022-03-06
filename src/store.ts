import { open } from 'lmdb';
import { CompactNode, fromCompact, Node } from './node';
import { numberfromBuffer, numberToBuffer } from './util';

/**
 * The Store handles the communication with the underlying database.
 */
export class Store {

    /**
     * The current version of the stored data.
     */
    public version: number;

    /**
     * The root database.
     */
    private lmdb = open({
        path: this.dir,
        compression: true,
        noMemInit: true
    });

    /**
     * The databse storing root hashes for each version.
     */
    private versionDB = this.lmdb.openDB<Buffer, number>({
        name: 'versions',
        encoding: 'binary'
    });

    /**
     * The database for storing all nodes of all kept versions.
     */
    private nodeDB = this.lmdb.openDB<CompactNode, Buffer>({
        name: 'nodes',
        keyEncoding: 'binary'
    });

    /**
     * The database for storing orphaned nodes.
     */
    private orphanDB = this.lmdb.openDB<true, Buffer>({
        name: 'orphans',
        keyEncoding: 'binary'
    });

    /**
     * A stack of currently active transaction objects.
     */
    private transactions: Transaction[] = [];

    constructor(private dir: string) {
        this.version = this.getLatestVersion();
    }

    /**
     * Runs an action function inside a transaction. The transaction will be written
     * synchronously.
     * 
     * @param action - The function that executes the queries for the transaction.
     */
    public transaction(action: () => void): void {
        if (this.transactions.length === 0) {
            this.version++;
        }

        this.lmdb.transactionSync(action);
    }

    /**
     * Starts a new ongoing transaction.
     */
    public startTransaction(): void {
        this.transaction(
            () => new Promise<void>(
                (commit, revert) => this.transactions.push({ commit, revert })
            )
        );
    }

    /**
     * Commits the last transaction of the stack.
     * 
     * For convenience this method is async because the
     * commit will not happen synchronously but at the end of
     * the turn when the promise gets actually resolved.
     */
    public async commitTransaction(): Promise<void> {
        const transaction = this.transactions.pop();

        if (!transaction) {
            throw new Error('Trying to commit but no transaction was startet.');
        }

        transaction.commit();
    }

    /**
     * Reverts the last transaction of the stack.
     * 
     * For convenience this method is async because the
     * revert will not happen synchronously but at the end of
     * the turn when the promise gets actually rejected.
     */
    public async revertTransaction(): Promise<void> {
        const transaction = this.transactions.pop();

        if (!transaction) {
            throw new Error('Trying to revert but no transaction was startet.');
        }

        // In case the last transaction is reverted the
        // version number must be decreased.
        if (this.transactions.length === 0) {
            this.version--;
        }

        transaction.revert();
    }

    /**
     * Stores the root hash of a version.
     * 
     * @param version - The version for which the root hash is to be stored.
     * @param rootHash - The root hash that will be stored.
     */
    public putVersion(version: number, rootHash?: Buffer): void {
        this.versionDB.putSync(version, rootHash || Buffer.alloc(0));
    }

    /**
     * Fetches the root hash of a version from the database.
     * 
     * @param version - The version for which the root hash should be retrieved.
     *                  Defaults to the latest version.
     * @returns If the version exists the hash of the root node.
     */
    public getVersion(version = this.version): Buffer | undefined {
        const rootHash = this.versionDB.getBinary(version);

        return rootHash?.length ? rootHash : undefined;
    }

    /**
     * Stores a node to the database.
     * 
     * @param node - The node that shoudl be stored.
     */
    public putNode(node: Node): void {
        this.nodeDB.putSync(node.hash!, node.compact());
    }

    /**
     * Fetches a node from the database.
     * 
     * @param hash - The hash of the node.
     * @returns If found a Branch or Leaf instance of the node.
     */
    public getNode(hash: Buffer): Node | undefined {
        return fromCompact(this, this.nodeDB.get(hash), hash);
    }

    /**
     * Sets a node as orphaned.
     * 
     * @param hash - The hash of the node that became an orphan.
     * @param fromVersion - The version in which the node was first created.
     * @param toVersion - The highest version in which the node still exists.
     */
    public putOrphan(hash: Buffer, fromVersion: number, toVersion?: number): void {
        toVersion = toVersion || this.version - 1;

        // In case the node was created within the same version/transaction
        // it should not become an orphan but instead be deleted within
        // transaction and effectively never be stoed to disk.
        if (fromVersion > toVersion) {
            this.nodeDB.removeSync(hash);

            return;
        }

        this.orphanDB.putSync(
            Buffer.concat([numberToBuffer(toVersion), numberToBuffer(fromVersion), hash]),
            true
        );
    }

    /**
     * Deletes a range of versions from the database.
     * 
     * @param toVersion - The highest version that will be deleted.
     * @param fromVersion - The lowest version that will be deleted.
     */
    public prune(toVersion: number, fromVersion: number): Promise<void> {
        return this.lmdb.transaction(() => {
            const { nodeDB, orphanDB, versionDB } = this;

            let previousVersion = 0;

            // Find the highest version lower than fromVersion.
            for (const version of versionDB.getKeys({ start: fromVersion - 1, limit: 1, reverse: true })) {
                previousVersion = version;
            }

            // Loop over all nodes that became orphans in the range of versions
            // and delete them if they're no longer needed.
            for (const key of orphanDB.getKeys({ start: numberToBuffer(fromVersion - 1), end: numberToBuffer(toVersion + 1) })) {
                const _fromVersion = numberfromBuffer(key.slice(4, 8));
                const hash = key.slice(8);

                orphanDB.removeSync(key);

                // If the node was created after the previous version there will be
                // no referece to that node anymore and it can be deleted. Otherwise
                // the orphan is stored again with the new toVersion set to the
                // previous version.
                previousVersion < _fromVersion
                    ? nodeDB.removeSync(hash)
                    : this.putOrphan(hash, _fromVersion, previousVersion);
            }

            // Loop over the versions and delete them.
            for (const version of versionDB.getKeys({ start: fromVersion, end: toVersion + 1 })) {
                versionDB.removeSync(version);
            }
        });
    }

    /**
     * Destroys the store by closing the database connection.
     */
    public destroy(): Promise<void> {
        return this.lmdb.close();
    }

    /**
     * Finds the latest version in the database.
     */
    private getLatestVersion(): number {
        for (const version of this.versionDB.getKeys({ limit: 1, reverse: true })) {
            return version;
        }

        return 0;
    }

}

/**
 * A transaction object that can be used to commit or revert a transaction.
 */
interface Transaction {
    commit: () => void;
    revert: () => void;
}
