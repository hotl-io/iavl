<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [iavl](./iavl.md) &gt; [Tree](./iavl.tree.md)

## Tree class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

A versioned and snapshottale IAVL+ tree for storing data that can be proven to exist using a merkle root hash of the tree.

<b>Signature:</b>

```typescript
export declare class Tree 
```

## Constructors

|  Constructor | Modifiers | Description |
|  --- | --- | --- |
|  [(constructor)(dbDir)](./iavl.tree._constructor_.md) |  | <b><i>(BETA)</i></b> Constructs a new instance of the <code>Tree</code> class |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [rootHash?](./iavl.tree.roothash.md) |  | Buffer | <b><i>(BETA)</i></b> <i>(Optional)</i> The SHA256 hash of the current tree state. |
|  [version](./iavl.tree.version.md) |  | number | <b><i>(BETA)</i></b> The latest version of the tree. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [applySnapshot(dir)](./iavl.tree.applysnapshot.md) |  | <b><i>(BETA)</i></b> Imports a previously stored snapshot and writes its nodes to the database. |
|  [commitTransaction()](./iavl.tree.committransaction.md) |  | <b><i>(BETA)</i></b> Commits the currently open transaction. In case there are no other transactions running a new version of the tree is persisted. |
|  [createSnapshot(dir, chunkSize)](./iavl.tree.createsnapshot.md) |  | <b><i>(BETA)</i></b> Creates a snapshot of the current version of the tree. |
|  [destroy()](./iavl.tree.destroy.md) |  | <b><i>(BETA)</i></b> Destroys the tree instance. Can be used to close the connection to the underlying database. |
|  [get(key)](./iavl.tree.get.md) |  | <b><i>(BETA)</i></b> Retrieves a value from the tree. |
|  [getProof(key)](./iavl.tree.getproof.md) |  | <b><i>(BETA)</i></b> Creates a merkle proof for a given key that can then be verified to be sure that the key and its value exist in the tree. |
|  [has(key)](./iavl.tree.has.md) |  | <b><i>(BETA)</i></b> Checks if a node of a given key exists. |
|  [insert(key, value)](./iavl.tree.insert.md) |  | <b><i>(BETA)</i></b> Inserts a key-value pair to the tree. |
|  [prune(toVersion, fromVersion)](./iavl.tree.prune.md) |  | <b><i>(BETA)</i></b> Deletes a range of versions of the tree. |
|  [remove(key)](./iavl.tree.remove.md) |  | <b><i>(BETA)</i></b> Removes a key-value pair from the tree. |
|  [revertTransaction()](./iavl.tree.reverttransaction.md) |  | <b><i>(BETA)</i></b> Reverts the currently open transaction. |
|  [startTransaction()](./iavl.tree.starttransaction.md) |  | <b><i>(BETA)</i></b> Starts new transaction that can later be commited or reverted. |
|  [verifyProof(proof, key, value)](./iavl.tree.verifyproof.md) |  | <b><i>(BETA)</i></b> Verifies that a proof is valid. |
