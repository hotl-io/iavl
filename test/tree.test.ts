import { expect } from 'chai';
import lmdb from 'lmdb';
import { Branch, CompactNode } from '../src/node';
import { Store } from '../src/store';
import { Tree } from '../src/tree';
import { numberToBuffer, sha256 } from '../src/util';
import { cleanUp, dbDir, keys, values } from './util';

describe('Tree', () => {
    let tree: Tree;

    describe('Basic', ()  => {

        beforeEach(() => tree = new Tree(dbDir));
    
        afterEach(() => tree.destroy());

        after(cleanUp);

        it('should set key/value pairs', () => {
            tree.insert(keys.a, values.a);
            tree.insert(keys.b, values.b);
            tree.insert(keys.c, values.c);
            tree.insert(keys.z, values.z);
            tree.insert(keys.y, values.y);
            tree.insert(keys.x, values.x);
    
            expect(tree.version).to.equal(6);
            expect(tree.rootHash!.toString('base64')).to.equal('A/+90ZpiaqwkFsYhzUbVxbk/Pdch27ZSiWTcEHh7MW8=');
        });
    
        it('should get key/value pairs', () => {
            expect(tree.get(keys.a)).to.deep.equal(values.a);
            expect(tree.get(keys.b)).to.deep.equal(values.b);
            expect(tree.get(keys.c)).to.deep.equal(values.c);
            expect(tree.get(keys.z)).to.deep.equal(values.z);
            expect(tree.get(keys.y)).to.deep.equal(values.y);
            expect(tree.get(keys.x)).to.deep.equal(values.x);
        });
    
        it('should remove key/value pairs', () => {
            tree.remove(keys.c);
    
            expect(tree.version).to.equal(7);
            expect(tree.rootHash!.toString('base64')).to.equal('IDKolyyruogcFXX9UXkoUAM5SYN9qY0d4Fa97C1+QlQ=');
        });
    
        it('should prune old versions', () => {
            tree.prune(tree.version - 1, 2);
        });
    
        it('should set key/value pairs atomically', async () => {
            tree.startTransaction();
    
            tree.insert(keys.d, values.d);
    
            await tree.commitTransaction();
    
            expect(tree.version).to.equal(8);
            expect(tree.get(keys.d)).to.deep.equal(values.d);
            expect(tree.rootHash!.toString('base64')).to.equal('Tbm6G6K80K7r9cYdakFHzZ82YUbicfTVmYfzInlgmwI=');
        });
    
        it('should abort the transaction', async () => {
            tree.startTransaction();
    
            tree.insert(keys.e, values.e);
    
            expect(tree.get(keys.e)).to.deep.equal(values.e);
    
            await tree.revertTransaction();
    
            expect(tree.get(keys.e)).to.be.undefined;
        });

        it('should handle parallel trees', async () => {
            const tree2 = tree.clone();

            tree.startTransaction();

            tree.insert(keys.e, values.e);

            expect(tree.get(keys.e)).to.deep.equal(values.e);
            expect(tree2.get(keys.e)).to.be.undefined;

            await tree.revertTransaction();
            await tree2.destroy();
        });

        it('should handle nested transactions', async () => {
            tree.startTransaction();
    
            tree.insert(keys.e, values.e);

            tree.startTransaction();

            tree.insert(keys.f, values.f);
            
            expect(tree.get(keys.e)).to.deep.equal(values.e);
            expect(tree.get(keys.f)).to.deep.equal(values.f);

            await tree.revertTransaction();
    
            expect(tree.get(keys.e)).to.deep.equal(values.e);
            expect(tree.get(keys.f)).to.be.undefined;
    
            await tree.commitTransaction();
    
            expect(tree.get(keys.e)).to.deep.equal(values.e);
            expect(tree.get(keys.f)).to.be.undefined;
        });
    
        it('should create proofs', () => {
            const proof = tree.getProof(keys.a);
    
            expect(
                () => tree.verifyProof(proof, keys.a, values.a)
            ).not.to.throw();
        });

    });

    describe('Advanced', () => {
        let store: Store;
        let versionDB: lmdb.Database<Buffer, number>;
        let nodeDB: lmdb.Database<CompactNode, Buffer>;
        let orphanDB: lmdb.Database<true, Buffer>;

        beforeEach(() => {
            tree = new Tree(dbDir);
            store = tree['store'];
            versionDB = store['versionDB'];
            nodeDB = store['nodeDB'];
            orphanDB = store['orphanDB'];
        });
    
        afterEach(async () => {
            await tree.destroy();
            cleanUp();
        });

        it('should create random versions', async () => {
            const numberOfVersions = 30;
            const numberOfInserts = 30;
            
            for (let i = 1; i <= numberOfVersions; i++) {
                tree.startTransaction();
    
                for (let j = 0; j < numberOfInserts; j++) {
                    tree.insert(...randomKeyValuePair());
                }
    
                await tree.commitTransaction();
            }
    
            let versions = versionDB.getRange({}).asArray;
    
            expect(versions.length).to.equal(numberOfVersions);
    
            for (let i = 1; i < numberOfVersions; i++) {
                await tree.prune(i, i);
            }
    
            versions = versionDB.getRange({}).asArray;
    
            expect(versions.length).to.equal(1);
            expect(versions[0].value).to.deep.equal(tree.rootHash);
    
            expect(Array.from(tree.inOrderTraversal()).length).to.equal(nodeDB.getRange({}).asArray.length);
    
            expect(orphanDB.getRange({}).asArray.length).to.equal(0);
        });
    
        it('should randomly delete versions', async () => {
            cleanUp();
    
            const numberOfVersions = 30;
            const numberOfInserts = 30;
            const randomVersions: number[] = [];
            
            for (let i = 1; i <= numberOfVersions; i++) {
                tree.startTransaction();
    
                for (let j = 0; j < numberOfInserts; j++) {
                    tree.insert(...randomKeyValuePair());
                }
    
                await tree.commitTransaction();
    
                randomVersions.push(i);
            }
    
            randomVersions.pop();
            randomVersions.sort(() => Math.random() - 0.5);
    
            let versions = versionDB.getRange({}).asArray;
    
            expect(versions.length).to.equal(numberOfVersions);
    
            while (randomVersions.length) {
                const j = randomVersions.pop() as number;
    
                await tree.prune(j, j);
            }
    
            versions = versionDB.getRange({}).asArray;
    
            expect(versions.length).to.equal(1);
            expect(versions[0].value).to.deep.equal(tree.rootHash);
    
            expect(Array.from(tree.inOrderTraversal()).length).to.equal(nodeDB.getRange({}).asArray.length);
    
            expect(orphanDB.getRange({}).asArray.length).to.equal(0);
        });
    
        it('should perform random operations', async () => {
            cleanUp();
    
            const numberOfVersions = 5;
            const numberOfOperations = 30;
            const rootHashes = [
                'DlnkZzZK0Wi5qE7yWoay02DQ+iZMGxtfcF7MRTPfbY0=',
                'kIQoB39f8b6ABzh2DEFw+igH9XXtVFwMQB4+9NzCVwM=',
                'PfNCD/GwaT3UPy3NyTntXQvWXBLRnpOFNk+WWtuIi1E=',
                'ZXz6Lq3MBJ6iLGHMpRLpkI2iQEzXFAi9TN86i0/+eL4=',
                'OOj3lSSFnvr303NSO7Oi5cT6SSqnUwEzEcwhVt8I7Z8='
            ];
    
            for (let i = 1; i <= numberOfVersions; i++) {
                tree.startTransaction();
    
                for (let j = 0; j < numberOfOperations; j++) {
                    const [key, value] = deterministicKeyValuePair(i, j);
    
                    if (i > 1 && (i + j) % 3 === 0) {
                        tree.remove(key);
                    } else {
                        tree.insert(key, value);
                    }
                }
    
                await tree.commitTransaction();
    
                expect(rootHashes[i - 1]).to.deep.equal(tree.rootHash!.toString('base64'));

                for (const node of tree.inOrderTraversal()) {
                    if (node instanceof Branch) {
                        expect(Math.abs(node.leftHeight - node.rightHeight)).to.be.lessThan(2);
                    }
                }
            }
        });

    });

});

function randomKeyValuePair(): [Buffer, Buffer] {
    const hash = sha256(numberToBuffer(Math.floor(Math.random() * 100) + 1));

    return [hash.slice(0, 16), hash.slice(16)];
}

function deterministicKeyValuePair(i: number, j: number): [Buffer, Buffer] {
    const keyHash = sha256(numberToBuffer(j));
    const valueHash = sha256(numberToBuffer(i * j));

    return [keyHash.slice(16), valueHash.slice(16)];
}
