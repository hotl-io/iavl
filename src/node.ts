import { Store } from './store';
import { numberToBuffer, sha256 } from './util';

/**
 * This class represents branch nodes of the tree. Since the tree is binary
 * branches always have two subtrees referred to as left or right subtree.
 * 
 * A branch does not contain a value since values are only stored in leaf nodes.
 * It does however have a key that is always the same as the key of the leftmost
 * leaf of the branch's right subtree.
 * 
 * The main purpose of branches is to have the calculated hash of its subtrees
 * to eventually have a single hash of the highest branch (the root node). This
 * hash is the fingerprint of any version of the tree making it a merkle tree.
 */
export class Branch implements Node {

    public get height(): number {
        return 1 + Math.max(this.leftHeight, this.rightHeight);
    }

    /**
     * A weak reference to the left subtree.
     */
    public get left(): Node {
        if (this._left) {
            return this._left;
        }

        return this._left = this.store.getNode(this.leftHash!)!;
    }

    public set left(node: Node) {
        this._left = node;
        this.leftHeight = node.height;
        this.isDirty = this.isDirty || node.isDirty || this.leftHash !== node.hash;

        delete this.leftHash;
    }

    /**
     * A weak reference to the right subtree.
     */
    public get right(): Node {
        if (this._right) {
            return this._right;
        }

        return this._right = this.store.getNode(this.rightHash!)!;
    }

    public set right(node: Node) {
        this._right = node;
        this.rightHeight = node.height;
        this.isDirty = this.isDirty || node.isDirty || this.rightHash !== node.hash;

        delete this.rightHash;
    }

    public isDirty: boolean;

    /**
     * The balance factor used to rotate around this node if necessary.
     */
    private get balanceFactor(): number {
        return this.leftHeight - this.rightHeight;
    }

    /**
     * An internal reference to the left subtree.
     */
    private _left?: Node;

    /**
     * An internal reference to the right subtree.
     */
    private _right?: Node;

    constructor(
        /**
         * The store instance for database access.
         */
        private store: Store,

        public key: Buffer,

        public version?: number,

        /**
         * The height of the left subtree.
         */
        public leftHeight = 0,

        /**
         * The height of the right subtree.
         */
        public rightHeight = 0,

        /**
         * The SHA256 hash of the left subtree.
         */
        public leftHash?: Buffer,

        /**
         * The SHA256 hash of the right subtree.
         */
        public rightHash?: Buffer,

        public hash?: Buffer
    ) {
        this.isDirty = !hash;
    }

    public insert(key: Buffer, value: Buffer): Node {
        switch (key.compare(this.key)) {
            // The key should be added to the left subtree.
            case -1:
                this.left = this.left.insert(key, value);

                break;

            // The key should be added to the right subtree.
            default:
                this.right = this.right.insert(key, value);
        }

        return this.balance();
    }

    public remove(key: Buffer): Node | undefined {
        const comparison = key.compare(this.key);

        // The key is supposed to be in the left subtree.
        if (comparison < 0) {
            // Recursively update the left subtree.
            const left = this.left.remove(key);

            // If there still is a left subtree this node is balanced.
            if (left) {
                this.left = left;

                return this.balance();
            }

            // In case the left subtree was removed completely this
            // node can be replaced by its right subtree and becomes
            // an orphan.
            this.store.putOrphan(this.hash!, this.version!);

            return this.right;
        }

        // The key is supposed to be in the right subtree.
        // Recursively update the right subtree.
        const right = this.right.remove(key);

        // If there still is a right subtree this node is balanced.
        if (right) {
            this.right = right;

            // In case this node's key was removed it needs to
            // be replaced by the leftmost key of the right subtree.
            if (comparison < 1) {
                this.key = right.leftmost().key;
            }

            return this.balance();
        }

        // In case the right subtree was removed completely this
        // node can be replaced by its left subtree and becomes
        // an orphan.
        this.store.putOrphan(this.hash!, this.version!);

        return this.left;
    }

    public find(key: Buffer): Leaf | undefined {
        if (key.compare(this.key) < 0) {
            return this.left.find(key);
        }

        return this.right.find(key);
    }

    public findPath(key: Buffer, path: Node[] = []): Node[] {
        if (key.compare(this.key) < 0) {
            this.left.findPath(key, path);
        } else {
            this.right.findPath(key, path);
        }

        path.push(this);

        return path;
    }

    public leftmost(): Node {
        return this.left.leftmost();
    }

    public persist(version = this.store.version): Buffer {
        // In case one or both of the subtrees were touched the
        // must be persisted, too.
        this._left && (this.leftHash = this._left.persist());
        this._right && (this.rightHash = this._right.persist());

        // If this branch was modified it needs to get a new hash,
        // an updated version and be stored to disk again.
        if (this.isDirty) {
            const store = this.store;

            this.hash && store.putOrphan(this.hash, this.version!);

            this.version = version;
            this.hash = sha256(numberToBuffer(version), this.leftHash!, this.rightHash!);
            this.isDirty = false;

            this.store.putNode(this);
        }

        return this.hash!;
    }

    public compact(): CompactBranch {
        return [
            this.key,
            this.version!,
            this.leftHeight,
            this.rightHeight,
            this.leftHash,
            this.rightHash
        ];
    }

    /**
     * Rebalances this branch by performing necessary rotations.
     */
    private balance(): Branch {
        let branch: Branch;

        switch (this.balanceFactor) {
            // The branch is left heavy.
            case 2:
                branch = this.left as Branch;

                // The left subtree is right heavy so a left rotation
                // on the subtree should be preformed first.
                if (branch.balanceFactor < 0) {
                    this.left = branch.leftRotation();
                }

                return this.rightRotation();

            // The branh is right heavy.
            case -2:
                branch = this.right as Branch;

                // The right subtree is left heavy so a right rotation
                // on the subtree should be preformed first.
                if (branch.balanceFactor > 0) {
                    this.right = branch.rightRotation();
                }

                return this.leftRotation();
        }

        return this;
    }

    /**
     * Performs a single left rotation.
     * 
     * ```txt
     *    2
     *   / \                                   4
     *  1   4                                 / \
     *     / \       2.leftRotation()        2   5
     *    3   6      ----------------->     / \   \
     *         \                           1   3   6
     *          7
     * ```
     */
    private leftRotation(): Branch {
        const root = this.right as Branch; // 4

        // The left part (3) of the new root (4) becomes the new right of this node (2).
        if (root._left) {
            this.right = root._left;
        } else {
            this.rightHash = root.leftHash;
            this.rightHeight = root.leftHeight;
            this.isDirty = true;

            delete this._right;
        }

        // This node (2) becomes the new left of the new root (4).
        root.left = this;

        return root;
    }

    /**
     * Performs a single right rotation.
     * 
     * ```txt
     *        5
     *       / \                                3
     *      3   6                              / \
     *     / \       5.rightRotation()        2   5
     *    2   4      ------------------>     /   / \
     *   /                                  1   4   6
     *  1
     * ```
     */
    private rightRotation(): Branch {
        const root = this.left as Branch; // 2

        // The right part (4) of the new root (3) becomes the new left of this node (5).
        if (root._right) {
            this.left = root._right;
        } else {
            this.leftHash = root.rightHash;
            this.leftHeight = root.rightHeight;
            this.isDirty = true;

            delete this._left;
        }

        // This node (5) becomes the new right of the new root (3).
        root.right = this;

        return root;
    }

}

/**
 * This class represents a leaf node of the branch. A leaf stores a key-value
 * pair and calculates a versioned hash for this key-value pair.
 */
export class Leaf implements Node {

    public height = 1;

    public isDirty: boolean;

    constructor(
        /**
         * A reference to the store for persisting
         * changes made to the leaf. 
         */
        private store: Store,

        public key: Buffer,

        /**
         * The value that is stored for the key.
         */
        public value: Buffer,

        public version?: number,

        public hash?: Buffer
    ) {
        this.isDirty = !hash;
    }

    public insert(key: Buffer, value: Buffer) {
        let newBranch: Branch;

        // In case the key is different from this leaf's key
        // the leaf is replaced by a new branch that has this
        // leaf and a newly created one as children.
        switch (key.compare(this.key)) {
            // The key should be before of this leafs key.
            case -1:
                newBranch = new Branch(this.store, this.key);

                newBranch.left = new Leaf(this.store, key, value);
                newBranch.right = this;

                return newBranch;

            // The key should be after of this leafs key.
            case 1:
                newBranch = new Branch(this.store, key);

                newBranch.left = this;
                newBranch.right = new Leaf(this.store, key, value);

                return newBranch;
        }

        // In case the key is the same the leaf is just updated
        // with the new value.
        this.value = value;
        this.isDirty = true;

        return this;
    }

    public remove(key: Buffer): Leaf | undefined {
        // If this node's key matches the given key we return
        // undefined and make this node an orphan.
        if (key.compare(this.key) === 0) {
            this.store.putOrphan(this.hash!, this.version!);

            return undefined;
        }

        // Otherwise we just return this node (the
        // key is not in the tree and nothing changes). 
        return this;
    }

    public find(key: Buffer): Leaf | undefined {
        return key.compare(this.key) === 0 ? this : undefined;
    }

    public findPath(_key: Buffer, path: Node[] = []): Node[] {
        path.push(this);

        return path;
    }

    public leftmost(): Leaf {
        return this;
    }

    public persist(version = this.store.version): Buffer {
        // If this leaf was modified it needs to get a new hash,
        // an updated version and be stored to disk again.
        if (this.isDirty) {
            const store = this.store;

            this.hash && store.putOrphan(this.hash, this.version!);

            this.version = version;
            this.hash = sha256(numberToBuffer(version), this.key, this.value);
            this.isDirty = false;

            this.store.putNode(this);
        }

        return this.hash!;
    }

    public compact(): CompactLeaf {
        return [this.key, this.value, this.version!];
    }

}

/**
 * Creates a Node instance from the compact form.
 * 
 * @param store - A reference to the store.
 * @param compact - The compact form of a either a branch or a leaf.
 * @param hash - The hash of the node that will be created.
 * @returns Depending on the compact data an instance of a Branch or a Leaf will be returned.
 */
export function fromCompact(store: Store, compact?: CompactNode, hash?: Buffer): Node | undefined {
    if (!compact) {
        return compact;
    }

    if (compact.length === 3) {
        return new Leaf(store, ...compact, hash);
    }

    return new Branch(store, ...compact, hash);
}

/**
 * A common interface for branches and leaves of the tree.
 */
export interface Node {

    /**
     * The key of the node.
     */
    key: Buffer;

    /**
     * The height of the node that is always one more
     * than the height of the highest of its subtrees.
     */
    height: number;

    /**
     * The SHA256 hash of the node.
     */
    hash?: Buffer;

    /**
     * The version in which the node was created.
     */
    version?: number;

    /**
     * Whether or not this node was updated and needs to
     * be persisted to disk again.
     */
    isDirty: boolean;

    /**
     * Recursively inserts a key-value pair in the tree.
     *  
     * @param key - The key that will be added to tree.
     * @param value - The value for the key.
     */
    insert(key: Buffer, value: Buffer): Node;

    /**
     * Recursively removes a key from the tree.
     * 
     * @param key - The key that is supposed to be removed. 
     * @returns The new root node of the subtree.
     */
    remove(key: Buffer): Node | undefined;

    /**
     * Recursively searches for the leaf with the given key.
     * 
     * @param key - The key of the leaf that is searched for.
     */
    find(key: Buffer): Leaf | undefined;

    /**
     * Recursively finds a path of nodes that should lead to the leaf
     * with the given key.
     * 
     * @param key - The key to which the path should lead.
     */
    findPath(key: Buffer): Node[];
    findPath(key: Buffer, path?: Node[]): Node[];

    /**
     * Follows the leftmost path of the node to find the leaf with
     * the lowest key.
     */
    leftmost(): Node;

    /**
     * Ensures the node is stored to disk under the right version.
     * 
     * @param version - Optional version that the node is stored under.
     */
    persist(version?: number): Buffer;

    /**
     * Creates a compact representation of the node for efficiently storing
     * it in the database.
     */
    compact(): CompactNode;

}

/**
 * A compact representation of a node.
 */
export type CompactNode = CompactBranch | CompactLeaf;

/**
 * A compact representation of a branch.
 */
type CompactBranch = [Buffer, number, number, number, Buffer | undefined, Buffer | undefined];

/**
 * A compact representation of a leaf.
 */
type CompactLeaf = [Buffer, Buffer, number];
