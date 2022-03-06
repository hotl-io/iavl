import chai, { expect } from 'chai';
import spies from 'chai-spies';
import { Branch, fromCompact, Leaf } from '../src/node';
import { Store } from '../src/store';
import { numberToBuffer, sha256 } from '../src/util';
import { cleanUp, dbDir, keys, values } from './util';

chai.use(spies);

const zero = numberToBuffer(0);
const leafHash = sha256(zero, keys.e, values.e);

describe('Node', ()  => {
    let store: Store;
    let putOrphan: (hash: Buffer, fromVersion: number, toVersion?: number) => void;
    let leaf: Leaf;

    before(() => {
        store = new Store(dbDir);
        putOrphan = chai.spy.on(store, 'putOrphan');
    });

    beforeEach(() => leaf = new Leaf(store, keys.e, values.e));

    after(async () => {
        await store.destroy();
        cleanUp();
    });

    describe('Leaf', () => {

        it('should update the value', () => {
            const node = leaf.insert(keys.e, values.a);

            expect(node).to.equal(leaf);
            expect(leaf.value).to.deep.equal(values.a);
            expect(leaf.isDirty).to.be.true;
        });

        it('should insert before', () => {
            const branch = leaf.insert(keys.d, values.d) as Branch;
            const left = branch.left as Leaf;

            expect(branch).to.be.instanceof(Branch);
            expect(branch.key).to.deep.equal(keys.e);

            expect(branch.right).to.be.instanceOf(Leaf);
            expect(branch.right).to.equal(leaf);

            expect(left).to.be.instanceOf(Leaf);
            expect(left.value).to.deep.equal(values.d);
        });

        it('should insert after', () => {
            const branch = leaf.insert(keys.f, values.f) as Branch;
            const right = branch.right as Leaf;

            expect(branch).to.be.instanceof(Branch);
            expect(branch.key).to.deep.equal(keys.f);

            expect(branch.left).to.be.instanceOf(Leaf);
            expect(branch.left).to.equal(leaf);

            expect(right).to.be.instanceOf(Leaf);
            expect(right.value).to.deep.equal(values.f);
        });

        it('should be stored', () => {
            leaf.persist();

            expect(leaf.hash).to.deep.equal(leafHash);
            expect(store.getNode(leafHash)).to.deep.equal(leaf);
        });

        it('should be orphaned', () => {
            leaf.persist();
            leaf.insert(keys.e, values.a);

            leaf.persist();

            expect(putOrphan).to.have.been.first.called.with.exactly(leafHash, 0);
        });

    });

    describe('Branch', () => {

        it('should insert before', () => {
            const root = leaf
                .insert(keys.d, values.d)
                .insert(keys.c, values.c) as Branch;
            const left = root.left as Branch;

            expect(root.key).to.deep.equal(keys.e);
            expect(root.height).to.equal(3);
            expect(root.right).to.equal(leaf);
            expect(root.right.height).to.equal(1);

            expect(left).to.be.instanceOf(Branch);
            expect(left.key).to.deep.equal(keys.d);
            expect(left.height).to.equal(2);
            expect(left.left.key).to.deep.equal(keys.c);
            expect(left.right.key).to.deep.equal(keys.d);
        });

        it('should insert after', () => {
            const root = leaf
                .insert(keys.d, values.d)
                .insert(keys.f, values.f) as Branch;
            const right = root.right as Branch;

            expect(root.key).to.deep.equal(keys.e);
            expect(root.height).to.equal(3);
            expect(root.left.key).to.deep.equal(keys.d);
            expect(root.left.height).to.equal(1);

            expect(right).to.be.instanceOf(Branch);
            expect(right.key).to.deep.equal(keys.f);
            expect(right.height).to.equal(2);
            expect(right.left.key).to.deep.equal(keys.e);
            expect(right.right.key).to.deep.equal(keys.f);
        });

        it('should rotate right', () => {
            const root = leaf
                .insert(keys.d, values.d)
                .insert(keys.c, values.c)
                .insert(keys.b, values.b) as Branch;

            const left = root.left as Branch;
            const right = root.right as Branch;

            expect(root.key).to.deep.equal(keys.d);
            expect(root.height).to.equal(3);

            expect(left.key).to.deep.equal(keys.c);
            expect(left.height).to.equal(2);
            expect(left.left.key).to.deep.equal(keys.b);
            expect(left.right.key).to.deep.equal(keys.c);

            expect(right.key).to.deep.equal(keys.e);
            expect(right.height).to.equal(2);
            expect(right.left.key).to.deep.equal(keys.d);
            expect(right.right.key).to.deep.equal(keys.e);
        });

        it('should rotate left-right', () => {
            const root = leaf
                .insert(keys.d, values.d)
                .insert(keys.b, values.b)
                .insert(keys.c, values.c) as Branch;

            const left = root.left as Branch;
            const right = root.right as Branch;

            expect(root.key).to.deep.equal(keys.d);
            expect(root.height).to.equal(3);

            expect(left.key).to.deep.equal(keys.c);
            expect(left.height).to.equal(2);
            expect(left.left.key).to.deep.equal(keys.b);
            expect(left.right.key).to.deep.equal(keys.c);

            expect(right.key).to.deep.equal(keys.e);
            expect(right.height).to.equal(2);
            expect(right.left.key).to.deep.equal(keys.d);
            expect(right.right.key).to.deep.equal(keys.e);
        });

        it('should rotate left', () => {
            const root = leaf
                .insert(keys.f, values.f)
                .insert(keys.x, values.x)
                .insert(keys.y, values.y) as Branch;

            const left = root.left as Branch;
            const right = root.right as Branch;

            expect(root.key).to.deep.equal(keys.x);
            expect(root.height).to.equal(3);

            expect(left.key).to.deep.equal(keys.f);
            expect(left.height).to.equal(2);
            expect(left.left.key).to.deep.equal(keys.e);
            expect(left.right.key).to.deep.equal(keys.f);

            expect(right.key).to.deep.equal(keys.y);
            expect(right.height).to.equal(2);
            expect(right.left.key).to.deep.equal(keys.x);
            expect(right.right.key).to.deep.equal(keys.y);
        });

        it('should rotate right-left', () => {
            const root = leaf
                .insert(keys.f, values.f)
                .insert(keys.y, values.y)
                .insert(keys.x, values.x) as Branch;

            const left = root.left as Branch;
            const right = root.right as Branch;

            expect(root.key).to.deep.equal(keys.x);
            expect(root.height).to.equal(3);

            expect(left.key).to.deep.equal(keys.f);
            expect(left.height).to.equal(2);
            expect(left.left.key).to.deep.equal(keys.e);
            expect(left.right.key).to.deep.equal(keys.f);

            expect(right.key).to.deep.equal(keys.y);
            expect(right.height).to.equal(2);
            expect(right.left.key).to.deep.equal(keys.x);
            expect(right.right.key).to.deep.equal(keys.y);
        });

        it('should be stored', () => {
            const root = leaf.insert(keys.d, values.d) as Branch;

            root.persist();

            const _root = store.getNode(root.hash!)!;
            const _left = store.getNode(root.left.hash!)!;
            const _right = store.getNode(root.right.hash!)!;

            expect(_root.compact()).to.deep.equal(root.compact());
            expect(_left.compact()).to.deep.equal(root.left.compact());
            expect(_right.compact()).to.deep.equal(root.right.compact());
        });

        it('should be orphaned', () => {
            const root = leaf.insert(keys.d, values.d) as Branch;

            root.persist();

            const rootHash = root.hash!;

            root.insert(keys.e, values.a);

            root.persist();

            expect(putOrphan).to.have.been.second.called.with.exactly(leafHash, 0);
            expect(putOrphan).to.have.been.third.called.with.exactly(rootHash, 0);
        });

    });

    describe('fromCompact', () => {

        it('should create a leaf from compact', () => {
            const node = fromCompact(store, [keys.c, values.c, 0], leafHash) as Leaf;

            expect(node).to.be.instanceOf(Leaf);
            expect(node.hash).to.deep.equal(leafHash);
            expect(node.key).to.deep.equal(keys.c);
            expect(node.value).to.deep.equal(values.c);
            expect(node.isDirty).to.false;
        });

        it('should create a branch from compact', () => {
            const leftHash = sha256(zero, keys.b, values.b);
            const hash = sha256(zero, leftHash, leafHash);
            const node = fromCompact(store, [keys.c, 0, 1, 1, leftHash, leafHash], hash) as Branch;

            expect(node).to.be.instanceOf(Branch);
            expect(node.hash).to.deep.equal(hash);
            expect(node.key).to.deep.equal(keys.c);
            expect(node.isDirty).to.false;
            expect(node.leftHash).to.deep.equal(leftHash);
            expect(node.rightHash).to.deep.equal(leafHash);
        });

    });

});
