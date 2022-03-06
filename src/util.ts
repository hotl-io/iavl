import { createHash } from 'crypto';

/**
 * Creates a SHA256 hash for a buffer of data.
 * 
 * @param data - The data that should be hashed.
 * @returns The hash of the data.
 */
export function sha256(...data: Buffer[]): Buffer {
    return createHash('sha256')
        .update(Buffer.concat(data))
        .digest();
}

/**
 * Turns a number into a buffer of its hex representation.
 * 
 * @param num - The number that will be turned into a buffer.
 * @returns The buffer for the number.
 */
export function numberToBuffer(num: number): Buffer {
    return Buffer.from(num.toString(16).padStart(8, '0'), 'hex');
}

/**
 * Turns a buffer representing a number back into a number value.
 * 
 * @param buffer - The buffer containing the hex representation of a number.
 * @returns The number from the buffer.
 */
export function numberfromBuffer(buffer: Buffer): number {
    return parseInt(buffer.toString('hex'), 16);
}
