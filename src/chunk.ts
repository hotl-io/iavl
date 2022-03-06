import { pack, unpack } from 'msgpackr';
import { fromCompact, Node } from './node';
import { Store } from './store';

/**
 * Combines nodes into a single chunk that can be written to disk.
 */
export class Chunk {

    /**
     * The current size of the chunk.
     */
    public size = 0;

    constructor(
        /**
         * Reference to the store.
         */
        private store: Store,

        /**
         * An array of packed compact nodes.
         */
        public packedNodes: Buffer[] = []
    ) { }

    /**
     * Takes a node and adds its packed compact version to this chunk unless
     * the maximum size would be reached.
     * 
     * @param node - The node that should be exported.
     * @param maxSize - The max size for the chunk.
     * @returns False when the maximum size would be reached. Otherwise true.
     */
    public addNode(node: Node, maxSize: number): boolean {
        const packedNode = pack(node.compact());

        // If the node size is larger than the maximum allowed size
        // the program should exit.
        if (packedNode.length > maxSize) {
            throw 'Node size is larger than the maximum chunk size.';
        }

        // If the chunk would overflow we stop here.
        if (this.size + packedNode.length > maxSize) {
            return false;
        }

        this.packedNodes.push(packedNode);
        this.size += packedNode.length;

        return true;
    }

    /**
     * Imports all packed nodes in the database.
     */
    public restoreNodes() {
        for (const packedNode of this.packedNodes) {
            const node = fromCompact(this.store, unpack(packedNode)) as Node;
            
            node.persist(node.version!);
        }
    }

}
