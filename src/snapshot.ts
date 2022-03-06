import { Command, InvalidArgumentError } from 'commander';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { pack, unpack } from 'msgpackr';
import { join } from 'path';
import { Chunk } from './chunk';
import { Branch, Node } from './node';
import { Store } from './store';

/**
 * Custom class that adds shared options to every command.
 */
class CommandWithDirs extends Command {

    public override createCommand(name: string): CommandWithDirs {
        return new CommandWithDirs(name)
            .requiredOption('--db-dir <path>', 'The directory containing the database.')
            .requiredOption('--dir <path>', 'The directory where the snapshot is stored.');
    }

}

const program = new CommandWithDirs('snapshot').version('0.1.0');

program
    .command('create')
    .requiredOption('--version <number>', 'The root hash for which the snapshot will be created.', toInteger)
    .option('--chunk-size <bytes>', 'The maximum size of chunks in byte.', toInteger, 1024 * 1024 * 10)
    .action((options: CreateOptions) => {
        new Snapshot(options.dir, options.dbDir).create(options.version, options.chunkSize);
    });

program
    .command('apply')
    .action((options: Options) => {
        return new Snapshot(options.dir, options.dbDir).apply();
    });

/**
 * Currently supported snapshot formats.
 */
 enum SnapshotFormat {
    Msgpack
}

/**
 * This class handles the export and import of tree versions.
 */
class Snapshot {

    /**
     * A store instance for database communication.
     */
    private store: Store;

    /**
     * The current chunk that while creating a new snapshot.
     */
    private chunk?: Chunk;

    /**
     * A descriptor object containg meta data for the snapshot.
     */
    private descriptor?: SnapshotDescriptor;

    constructor(
        /**
         * The folder where the snapshot is stored.
         */
        private dir: string,

        db: string
    ) {
        this.store = new Store(db);
    }

    /**
     * Creates a new export in the directory.
     * 
     * @param version - The version that should be exported.
     * @param chunkSize - The maximum size of each chunk.
     */
    public create(version: number, chunkSize: number): void {
        const rootHash = this.store.getVersion(version);

        if (!rootHash) {
            throw `Version ${ version } was not found.`;
        }

        const root = this.store.getNode(rootHash)!;

        rmSync(this.dir, { recursive: true, force: true });
        mkdirSync(this.dir, { recursive: true });

        this.descriptor = {
            version,
            rootHash: rootHash.toString('base64'),
            format: SnapshotFormat.Msgpack,
            timestamp: Date.now(),
            chunks: []
        };

        this.traverse(root, chunkSize);
        this.writeChunk();
        writeFileSync(join(this.dir, 'snapshot.json'), JSON.stringify(this.descriptor));
    }

    /**
     * Imports the snapshot located in the directory.
     */
    public async apply(): Promise<void> {
        const descriptorPath = join(this.dir, 'snapshot.json');

        if (!existsSync(descriptorPath)) {
            throw `No snapshot descriptor found in directory '${ this.dir }'`;
        }

        let descriptor: SnapshotDescriptor;

        try {
            descriptor = JSON.parse(readFileSync(descriptorPath, 'utf-8'));
        } catch (error) {
            throw 'The descriptor of the snapshot seems to be corrupted.';
        }

        if (!Object.values(SnapshotFormat).includes(descriptor.format)) {
            throw 'The snapshot has an unsupported format.';
        }

        const store = this.store;

        if (store.getVersion(descriptor.version)) {
            throw `Version ${ descriptor.version } already exists in the database.`;
        }

        store.startTransaction();

        store.putVersion(descriptor.version, Buffer.from(descriptor.rootHash, 'base64'));

        for (const hash of descriptor.chunks) {
            this.readChunk(hash);
        }

        return store.commitTransaction();
    }

    /**
     * Adds a given node to the current chunk and traverses its children.
     * When the current chunk has reached the maximum allowed size it is
     * written to disk and a new one is created.  
     * 
     * @param node - The node that will be traversed.
     * @param chunkSize - The maximum size of chunks.
     */
    private traverse(node: Node, chunkSize: number): void {
        if (!this.chunk?.addNode(node, chunkSize)) {
            this.writeChunk();

            this.chunk = new Chunk(this.store);

            return this.traverse(node, chunkSize);
        }

        if (!(node instanceof Branch)) {
            return;
        }

        node.left && this.traverse(node.left, chunkSize);
        node.right && this.traverse(node.right, chunkSize);
    }

    /**
     * Writes the current chunk to the directory.
     */
    private writeChunk(): void {
        if (!this.chunk) {
            return;
        }

        const packed = pack(this.chunk.packedNodes);
        const hash = createHash('md5').update(packed).digest('hex');

        this.descriptor!.chunks.push(hash);

        writeFileSync(join(this.dir, hash), packed);
    }

    /**
     * Reads a chunk from disk and imports its nodes.
     * 
     * @param hash - The md5 hash of the chunk.
     */
    private readChunk(hash: string): void {
        const chunkPath = join(this.dir, hash);

        if (!existsSync) {
            throw `The chunk with hash '${ hash }' was not found.`;
        }

        const packedChunk = readFileSync(chunkPath);

        try {
            new Chunk(this.store, unpack(packedChunk)).restoreNodes();
        } catch (error) {
            throw `Error importing chunk '${ hash }': ${ error }`;
        }
    }

}

program
    .parseAsync()
    .catch(console.error);

/**
 * Converts a command line argument into a number.
 * 
 * @param value - The argument that will be converted.
 * @returns The converted argument.
 */
function toInteger(value: string): number {
    if (isNaN(+value)) {
        throw new InvalidArgumentError('Not a number.');
    }

    return +value;
}

/**
 * The allowed command line options shared by all commands.
 */
interface Options {
    dir: string;
    dbDir: string;
}

/**
 * The allowed command line options for creatin.
 */
interface CreateOptions extends Options {
    version: number;
    chunkSize: number;
}

/**
 * An object describing a snapshot.
 */
interface SnapshotDescriptor {
    version: number;
    rootHash: string;
    format: SnapshotFormat;
    timestamp: number;
    chunks: string[];
}
