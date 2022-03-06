/**
 * A set of data that can proof that a key-valu pair exists in a tree
 * with a certain root hash.
 * 
 * @beta
 */
export type Proof = [ProofLeaf, ProofBranch[]];

/**
 * Data for calculating the hash of the leaf.
 * 
 * @beta
 */
export type ProofLeaf = [Buffer, Buffer, Buffer];

/**
 * Data for calculating the hash of a branch.
 * 
 * @beta
 */
export type ProofBranch = [Buffer, Buffer | undefined, Buffer | undefined];
