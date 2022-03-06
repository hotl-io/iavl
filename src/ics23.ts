import { ics23 } from '@confio/ics23';
import { Tree } from '.';
import { Branch, Node } from './node';

/**
 * The ICS23 spec for proofs of the tree.
 * 
 * @beta
 */
export const proofSpec: ics23.IProofSpec = {
    leafSpec: {
        hash: ics23.HashOp.SHA256
    },
    innerSpec: {
        childOrder: [0, 1],
        childSize: 32,
        minPrefixLength: 4,
        maxPrefixLength: 4,
        hash: ics23.HashOp.SHA256
    }
};

/**
 * Creates an ICS23 compliant existence proof.
 * 
 * @beta
 * @param tree - The tree for which a proof should be created.
 * @param key - The key that is supposed to exist in the tree.
 * @returns An existence proof.
 */
export function getExistenceProof(tree: Tree, key: Buffer): ics23.IExistenceProof {
    const [[version, , value], branches] = tree.getProof(key);

    return {
        key,
        value,
        leaf: {
            hash: ics23.HashOp.SHA256,
            prefix: version
        },
        path: branches.map(([version, leftHash, rightHash]) => ({
            hash: ics23.HashOp.SHA256,
            prefix: leftHash ? Buffer.concat([version, leftHash]) : version,
            suffix: rightHash || Buffer.alloc(0)
        }))
    };
}

/**
 * Creates an ICS23 compliant non-existence proof.
 * 
 * @beta
 * @param tree - The tree for which a proof should be created.
 * @param key - The key that is supposed to not exist in the tree.
 * @returns A non existence proof.
 */
export function getNonExistenceProof(tree: Tree, key: Buffer): ics23.INonExistenceProof {
    if (tree.has(key)) {
        throw new Error('Key exists.');
    }

    const left = findLeftNeighbor(key, tree.root);
    const right = findRightNeighbor(key, tree.root);

    return {
        key,
        left: left && getExistenceProof(tree, left.key),
        right: right && getExistenceProof(tree, right.key)
    };
}

/**
 * Tries to find the left neighbor of a given key.
 * 
 * @param key - The key for which the neighbor is needed.
 * @param node - The node search the neighbor in.
 * @returns The neighboring node.
 */
function findLeftNeighbor(key: Buffer, node?: Node): Node | undefined {
    if (!(node instanceof Branch)) {
        return;
    }

    if (key.compare(node.key) === 1) {
        return node.right && findLeftNeighbor(key, node.right) || node;
    }

    return node.left && findLeftNeighbor(key, node.left);
}

/**
 * Tries to find the right neighbor of a given key.
 * 
 * @param key - The key for which the neighbor is needed.
 * @param node - The node search the neighbor in.
 * @returns The neighboring node.
 */
function findRightNeighbor(key: Buffer, node?: Node): Node | undefined {
    if (!(node instanceof Branch)) {
        return;
    }

    if (key.compare(node.key) === -1) {
        return node.left && findRightNeighbor(key, node.left) || node;
    }
    
    return node.right && findRightNeighbor(key, node.right);
}
