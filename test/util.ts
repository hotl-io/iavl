import { rmSync } from 'fs';
import { join } from 'path';
import { Tree } from '../src';
import { Branch, Node } from '../src/node';
import { sha256 } from '../src/util';

export const dbDir = join(__dirname, 'db');

export const keys = {
    a: Buffer.from('a'),
    b: Buffer.from('b'),
    c: Buffer.from('c'),
    d: Buffer.from('d'),
    e: Buffer.from('e'),
    f: Buffer.from('f'),
    x: Buffer.from('x'),
    y: Buffer.from('y'),
    z: Buffer.from('z')
};

export const values = {
    a: Buffer.from('1'),
    b: Buffer.from('2'),
    c: Buffer.from('3'),
    d: Buffer.from('4'),
    e: Buffer.from('5'),
    f: Buffer.from('6'),
    x: Buffer.from('24'),
    y: Buffer.from('25'),
    z: Buffer.from('26')
};

export const hashes = {
    a: sha256(keys.a),
    b: sha256(keys.b),
    c: sha256(keys.c),
    d: sha256(keys.d),
    e: sha256(keys.e),
    f: sha256(keys.f)
};

export function cleanUp() {
    rmSync(dbDir, { recursive: true, force: true });
}

export function print(tree: Tree) {
    console.log(`\n--- Tree (${ tree.version }): ${ tree.rootHash!.toString('base64') } ---\n`);

    printBranch(tree.root!);
}

function printBranch(node: Node, padding = 0) {
    node instanceof Branch && node.right && printBranch(node.right, padding + 6);

    if (node) {
        console.log(''.padStart(padding, ' ') + node.key.toString());
    }

    node instanceof Branch && node.left && printBranch(node.left, padding + 6);
}
