import { expect } from 'chai';
import lmdb from 'lmdb';
import { Leaf } from '../src/node';
import { Store } from '../src/store';
import { numberToBuffer } from '../src/util';
import { cleanUp, dbDir, hashes, keys, values } from './util';

describe('Store', () => {
    let store: Store;
    let orphanDB: lmdb.Database<true, Buffer>;

    before(() => {
        store = new Store(dbDir);
        orphanDB = store['orphanDB'];

        store.version++;
    });

    after(async () => {
        await store.destroy();
        cleanUp();
    });

    it('should store versions', () => {
        store.putVersion(store.version, hashes.a);

        expect(store.getVersion()).to.deep.equal(hashes.a);
    });

    it('should store nodes', () => {
        const node1 = new Leaf(store, keys.a, values.a, store.version, hashes.a);

        store.putNode(node1);

        expect(store.getNode(hashes.a)).to.deep.equal(node1);
    });

    it('should store orphans', () => {
        store.putOrphan(hashes.a, 1, 1);

        expect(orphanDB.get(orphanKey(1, 1, hashes.a))).to.be.true;
    });

    it('should prune versions', async () => {
        // Prune Version 1

        await store.prune(1, 1);

        expect(orphanDB.get(orphanKey(2, 1, hashes.a))).to.be.undefined;
        expect(store.getNode(hashes.a)).to.be.undefined;
        expect(store.getVersion(1)).to.be.undefined;

        // Version 2

        const nodeB = new Leaf(store, keys.b, values.b, 2, hashes.b);

        store.putVersion(2, hashes.b);
        store.putNode(nodeB);

        // Version 3

        const nodeC = new Leaf(store, keys.c, values.c, 3, hashes.c);

        store.putVersion(3, hashes.c);
        store.putNode(nodeC);

        // Version 4

        store.putOrphan(hashes.b, nodeB.version!, 3);
        store.putOrphan(hashes.c, nodeC.version!, 3);

        store.version = 4;

        // Prune version 3

        await store.prune(3, 3);

        // nodeB should still exist with toVersion set to 2
        expect(orphanDB.get(orphanKey(3, 2, hashes.b))).to.be.undefined;
        expect(orphanDB.get(orphanKey(2, 2, hashes.b))).to.be.true;
        expect(store.getNode(hashes.b)).to.be.instanceOf(Leaf);

        // nodeC should be deleted
        expect(orphanDB.get(orphanKey(3, 3, hashes.c))).to.be.undefined;
        expect(store.getNode(hashes.c)).to.be.undefined;

        expect(store.getVersion(3)).to.be.undefined;
    });

    it('should support synchronous transaction', () => {
        const version = store.version;

        store.transaction(() => {
            store.putVersion(store.version, hashes.d);
        });

        expect(store.version).to.equal(version + 1);
    });

    it('should support asynchronous tansactions', async () => {
        const version = store.version;

        store.startTransaction();
        store.putVersion(store.version, hashes.e);
        await store.commitTransaction();

        expect(store.version).to.equal(version + 1);
    });

    it('should revert asynchronous transactions', async () => {
        const version = store.version;

        store.startTransaction();
        store.putVersion(store.version, hashes.f);
        await store.revertTransaction();

        expect(store.version).to.equal(version);
    });

});

function orphanKey(toVersion: number, fromVersion: number, hash: Buffer) {
    return Buffer.concat([numberToBuffer(toVersion), numberToBuffer(fromVersion), hash]);
}
