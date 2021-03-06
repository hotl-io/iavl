<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [iavl](./iavl.md)

## iavl package

## Classes

|  Class | Description |
|  --- | --- |
|  [Tree](./iavl.tree.md) | <b><i>(BETA)</i></b> A versioned and snapshottale IAVL+ tree for storing data that can be proven to exist using a merkle root hash of the tree. |

## Functions

|  Function | Description |
|  --- | --- |
|  [getExistenceProof(tree, key)](./iavl.getexistenceproof.md) | <b><i>(BETA)</i></b> Creates an ICS23 compliant existence proof. |
|  [getNonExistenceProof(tree, key)](./iavl.getnonexistenceproof.md) | <b><i>(BETA)</i></b> Creates an ICS23 compliant non-existence proof. |

## Variables

|  Variable | Description |
|  --- | --- |
|  [proofSpec](./iavl.proofspec.md) | <b><i>(BETA)</i></b> The ICS23 spec for proofs of the tree. |

## Type Aliases

|  Type Alias | Description |
|  --- | --- |
|  [Proof](./iavl.proof.md) | <b><i>(BETA)</i></b> A set of data that can proof that a key-valu pair exists in a tree with a certain root hash. |
|  [ProofBranch](./iavl.proofbranch.md) | <b><i>(BETA)</i></b> Data for calculating the hash of a branch. |
|  [ProofLeaf](./iavl.proofleaf.md) | <b><i>(BETA)</i></b> Data for calculating the hash of the leaf. |

