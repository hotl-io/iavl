import { fork } from 'child_process';
import { pack, unpack } from 'msgpackr';
import { join } from 'path';
import { Branch, Leaf, Node } from './node';
import { Proof } from './proof';
import { Store } from './store';
import { numberToBuffer, sha256 } from './util';

/**
 * A versioned and snapshottable IAVL+ tree for storing data that can be
 * proven to exist using a merkle root hash of the tree.
 * 
 * @beta
 */
export class Tree {

    /**
     * The latest version of the tree.
     */
    public get version(): number {
        return this.store.version;
    }

    /**
     * The SHA256 hash of the current tree state.
     */
    public rootHash?: Buffer;

    /**
     * A weak reference to teh root node of the latest version.
     * 
     * @internal
     */
    public get root(): Node | undefined {
        return this.rootHash && this.store.getNode(this.rootHash);
    }

    /**
     * A reference to the store that handles the communication
     * to the database.
     */
    private store = new Store(this.dbDir);

    constructor(
        /**
         * The folder where the database is stored.
         */
        private dbDir: string = 'db'
    ) {
        this.rootHash = this.store.getVersion();
    }

    /**
     * Inserts a key-value pair to the tree.
     */
    public insert<T>(key: Buffer, value: T): void {
        if (!value) {
            throw Error('The value cannot be a falsy value.');
        }

        const packedValue = pack(value);

        this.store.transaction(() => {
            const root = this.root?.insert(key, packedValue) || new Leaf(this.store, key, packedValue);

            root.persist();
            this.store.putVersion(this.version, root.hash);

            this.rootHash = root.hash;
        });
    }

    /**
     * Removes a key-value pair from the tree.
     */
    public remove(key: Buffer): void {
        this.store.transaction(() => {
            const root = this.root?.remove(key);

            root?.persist();
            this.store.putVersion(this.version, root?.hash);

            this.rootHash = root?.hash;
        });
    }

    /**
     * Retrieves a value from the tree.
     */
    public get<T>(key: Buffer): T {
        const leaf = this.root?.find(key);

        return leaf && unpack(leaf.value);
    }

    /**
     * Checks if a node of a given key exists.
     */
    public has(key: Buffer): boolean {
        return !!this.root?.find(key);
    }

    /**
     * Deletes a range of versions of the tree.
     * 
     * @param toVersion - The highest version that should be deleted.
     * @param fromVersion - The lowest version that should be deleted.
     *                      Defaults to 1 (deleting all versions older
     *                      than toVersion)
     */
    public prune(toVersion: number, fromVersion = 1): Promise<void> {
        return this.store.prune(toVersion, fromVersion);
    }

    /**
     * Creates a clone of the tree with the same settings but a different
     * db connection so modifications done in a transaction are not reflected
     * in the clone.
     */
    public clone(): Tree {
        return new Tree(this.dbDir);
    }

    /**
     * Destroys the tree instance. Can be used to close the connection
     * to the underlying database.
     */
    public destroy(): Promise<void> {
        return this.store.destroy();
    }

    /**
     * Creates a merkle proof for a given key that can then be verified to
     * be sure that the key and its value exist in the tree.
     * 
     * @param key - The key for which a proof is needed.
     * @returns The proof for the given key.
     */
    public getProof(key: Buffer): Proof {
        const path = this.root?.findPath(key);
        const leaf = path?.shift();

        if (!leaf || !(leaf instanceof Leaf)) {
            throw new Error('Key does not exist.');
        }

        return [
            [numberToBuffer(leaf.version!), key, leaf.value],
            (path as Branch[])!.map(branch => {
                return key.compare(branch.key) < 0
                    ? [numberToBuffer(branch.version!), undefined, branch.rightHash]
                    : [numberToBuffer(branch.version!), branch.leftHash, undefined];
            })
        ];
    }

    /**
     * Verifies that a proof is valid.
     * 
     * @param proof - The proof that should be verified.
     * @param key - The key that the proof is for.
     * @param value - The key's value that should be verified.
     */
    public verifyProof<T>(proof: Proof, key: Buffer, value: T): void {
        const [[_version, _key, _value], branches] = proof;

        if (_key.compare(key) !== 0) {
            throw new Error('Keys do not match.');
        }

        if (_value.compare(pack(value)) !== 0) {
            throw new Error('Values do not match.');
        }

        let hash = sha256(_version, _key, _value);

        for (const [version, left, right] of branches) {
            if (!left && !right) {
                throw new Error('The provided proof is not valid.');
            }

            hash = left ? sha256(version, left, hash) : sha256(version, hash, right!);
        }

        if (this.rootHash?.compare(hash) !== 0) {
            throw new Error('Calculated root hash does not match.');
        }
    }

    /**
     * Starts a new transaction that can later be commited or reverted.
     */
    public startTransaction(): void {
        this.store.startTransaction();
    }

    /**
     * Commits the currently open transaction. In case there are no other
     * transactions running a new version of the tree is persisted to disk.
     */
    public commitTransaction(): Promise<void> {
        return this.store.commitTransaction();
    }

    /**
     * Reverts the currently open transaction.
     */
    public async revertTransaction(): Promise<void> {
        await this.store.revertTransaction();

        this.rootHash = this.store.getVersion();
    }

    /**
     * Creates a snapshot of the current version of the tree.
     * 
     * @param dir - The folder in which the snapshot should be written.
     * @param version - The version for which a snapshot will be created. Defaults to the latest version.
     * @param chunkSize - The maximum size of each chunk. Could end up to be slightly more.
     */
    public createSnapshot(dir: string, version = this.version, chunkSize = 1024 * 1024 * 10): Promise<void> {
        return this.snapshot(
            'create',
            [
                `--dir=${ dir }`,
                `--db-dir=${ this.dbDir }`,
                `--version=${ version }`,
                `--chunk-size=${ chunkSize }`
            ]
        );
    }

    /**
     * Imports a previously stored snapshot and writes its nodes to the database.
     * 
     * @param dir - The folder that contains the snapshot.
     */
    public applySnapshot(dir: string): Promise<void> {
        return this.snapshot(
            'apply',
            [
                `--dir=${ dir }`,
                `--db-dir=${ this.dbDir }`
            ]
        );
    }

    /**
     * In-order traversal on a tree: left-root-right.
     * 
     * @internal
     */
    public * inOrderTraversal(node = this.root): Generator<Node, void> {
        if (!(node instanceof Branch)) {
            if (node) {
                yield node;
            }

            return;
        }

        if (node.left) {
            yield* this.inOrderTraversal(node.left);
        }

        if (node) {
            yield node;
        }

        if (node.right) {
            yield* this.inOrderTraversal(node.right);
        }
    }

    /**
     * Executes the snapshot script a child process.
     * 
     * @param command - The command that should be executed.
     * @param args - The command line arguments.
     */
    private snapshot(command: 'create' | 'apply', args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = fork(
                join(__dirname, 'snapshot'),
                [
                    command,
                    ...args
                ],
                {
                    silent: true
                }
            );

            child.stderr?.on('data', data => reject(data.toString()));
            child.once('exit', () => resolve());
        });
    }

}
