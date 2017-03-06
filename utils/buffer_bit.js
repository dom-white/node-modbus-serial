'use strict';
/**
 * Copyright (c) 2015, Yaacov Zamir <kobi.zamir@gmail.com>
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF  THIS SOFTWARE.
 */

/**
 * Adds Bit Operations to Buffer
 */
var addBufferBitOp = function() {

    /**
     * Add set one bit in a Buffer prototype.
     *
     * @param {boolean} value, new state of bit.
     * @param {number} bit, The bit offset.
     * @param {number} offset, the byte offset.
     */
    Buffer.prototype.writeBit = function(value, bit, offset) {
        var byteOffset = bit / 8 + offset;
        var bitOffset = bit % 8;
        var bitMask = 0x1 << bitOffset;

        // get byte from buffer
        var byte = this.readUInt8(byteOffset);

        // set bit on / off
        if (value) {
            byte |= bitMask;
        } else {
            byte &= ~bitMask;
        }

        // set byte to buffer
        this.writeUInt8(byte, byteOffset);
    };

    /**
     * Add get one bit in a Buffer prototype.
     *
     * @param {boolean} bit, The bit offset.
     * @param {number} offset, the byte offset.
     *
     * @return {boolean} the state of the bit.
     */
    Buffer.prototype.readBit = function(bit, offset) {
        var byteOffset = bit / 8 + offset;
        var bitOffset = bit % 8;
        var bitMask = 0x1 << bitOffset;

        // get byte from buffer
        var byte = this.readUInt8(byteOffset);

        // check bit state
        return (byte & bitMask) === bitMask;
    };
};

module.exports = addBufferBitOp;
