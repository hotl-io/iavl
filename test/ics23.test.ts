import { verifyExistence, verifyNonExistence } from '@confio/ics23';
import { expect } from 'chai';
import { pack } from 'msgpackr';
import { getExistenceProof, getNonExistenceProof, proofSpec } from '../src/ics23';
import { Tree } from '../src/tree';
import { cleanUp, dbDir, keys, values } from './util';

describe('Proofs', () => {
    let tree: Tree;

    before(() => {
        tree = new Tree(dbDir);

        tree.insert(keys.a, values.a);
        tree.insert(keys.b, values.b);
        tree.insert(keys.c, values.c);
        tree.insert(keys.z, values.z);
        tree.insert(keys.y, values.y);
        tree.insert(keys.x, values.x);
    });

    after(async () => {
        await tree.destroy();
        cleanUp();
    })

    it('should create ICS23 compliant existence proofs', () => {

        const existenceProof = getExistenceProof(tree, keys.a);

        expect(
            () => verifyExistence(existenceProof, proofSpec, tree.rootHash!, keys.a, pack(values.a))
        ).not.to.throw();
    });

    it('should create ICS23 compliant non-existence proofs', () => {
        const nonExistenceProof = getNonExistenceProof(tree, keys.d);

        expect(
            () => verifyNonExistence(nonExistenceProof, proofSpec, tree.rootHash!, keys.d)
        ).not.to.throw();
    });

});
