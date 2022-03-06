import { expect } from 'chai';
import { rmSync } from 'fs';
import { join } from 'path';
import { Tree } from '../src';
import { cleanUp, dbDir } from './util';

const snapshotDir = join(__dirname, 'snapshot');

describe('Snapshots', () => {
    let tree: Tree;

    afterEach(async () => {
        await tree.destroy();
    });

    after(() => {
        cleanUp();
        rmSync(snapshotDir, { recursive: true, force: true });
    });

    it('should complain about missing version', async () => {
        tree = new Tree(dbDir);

        let error: string | undefined = undefined;

        try {
            await tree.createSnapshot(snapshotDir, 1);
        } catch (_error) {
            error = _error as string;
        }

        expect(error).to.equal('Version 1 was not found.\n');
    });

    it('should export the latest version', async () => {
        tree = new Tree(dbDir);

        tree.insert(Buffer.from('keyA'), { value: 'valueA' });

        await tree.createSnapshot(snapshotDir);
    });

    it('should import a snapshot', async () => {
        cleanUp();

        expect(await applySnapshot()).to.be.undefined;
    });

    it('should not import an existing version', async () => {
        expect(await applySnapshot()).to.equal('Version 1 already exists in the database.\n');
    });

    async function applySnapshot(): Promise<string | void> {
        tree = new Tree(dbDir);

        try {
            await tree.applySnapshot(snapshotDir);
        } catch (error) {
            return error as string;
        }
    }

});
