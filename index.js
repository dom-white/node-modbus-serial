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
 * @fileoverview ModbusRTU module, exports the ModbusRTU class.
 * this class makes ModbusRTU calls fun and easy.
 *
 * Modbus is a serial communications protocol, first used in 1979.
 * Modbus is simple and robust, openly published, royalty-free and
 * easy to deploy and maintain.
 */

/**
 * Calculate buffer CRC16 and add it to the
 * end of the buffer.
 *
 * @param {buffer} buf the data buffer.
 * @param {number} length the length of the buffer without CRC.
 *
 * @return {number} the calculated CRC16
 */
function _CRC16(buf, length) {
    var crc = 0xFFFF;
    var tmp;

    // calculate crc16
    for (var i = 0; i < length; i++) {
        crc = crc ^ buf[i];

        for (var j = 0; j < 8; j++) {
            tmp = crc & 0x0001;
            crc = crc >> 1;
            if (tmp) {
              crc = crc ^ 0xA001;
            }
        }
    }

    // add to end of buffer
    buf.writeUInt16LE(crc, length);

    // return the crc
    return crc;
}

/**
 * Calculate buffer LRC and add it to the
 * end of the buffer.
 *
 * @param {buffer} buf the data buffer.
 * @param {number} length the length of the buffer without LRC.
 *
 * @return {number} the calculated LRC
 */
function _LRC(buf, length) {
    var lrc = 0;

    for (var i = 0; i < length; i++) {
         lrc += buf[i] & 0xFF;
     }
     lrc = ((lrc ^ 0xFF) + 1) & 0xFF;

     // add to end of buffer
     buf.writeUInt8(lrc, length);

     // return the lrc
     return lrc;
}


/**
 * Parse the data for a Modbus -
 * Read Coils (FC=02,01)
 *
 * @param {buffer} data the data buffer to parse.
 * @param {function} next the function to call next.
 */
function _readFC2(data, next) {
    var length = data.readUInt8(2);
    var contents = [];

    for (var i = 0; i < length; i++) {
        var reg = data[i + 3];

        for (var j = 0; j < 8; j++) {
            contents.push((reg & 1) == 1);
            reg = reg >> 1;
        }
    }

    if (next)
        next(null, {"data": contents, "buffer": data.slice(3, 3 + length)});
}

/**
 * Parse the data for a Modbus -
 * Read Input Registers (FC=04,03)
 *
 * @param {buffer} data the data buffer to parse.
 * @param {function} next the function to call next.
 */
function _readFC4(data, next) {
    var length = data.readUInt8(2);
    var contents = [];

    for (var i = 0; i < length; i += 2) {
        var reg = data.readUInt16BE(i + 3);
        contents.push(reg);
    }

    if (next)
        next(null, {"data": contents, "buffer": data.slice(3, 3 + length)});
}

/**
 * Parse the data for a Modbus -
 * Force Single Coil (FC=05)
 *
 * @param {buffer} data the data buffer to parse.
 * @param {function} next the function to call next.
 */
function _readFC5(data, next) {
    var dataAddress = data.readUInt16BE(2);
    var state = data.readUInt16BE(4);

    if (next)
        next(null, {"address": dataAddress, "state": (state == 0xff00)});
}

/**
 * Parse the data for a Modbus -
 * Preset Single Registers (FC=06)
 *
 * @param {buffer} data the data buffer to parse.
 * @param {function} next the function to call next.
 */
function _readFC6(data, next) {
    var dataAddress = data.readUInt16BE(2);
    var value = data.readUInt16BE(4);

    if (next)
        next(null, {"address": dataAddress, "value": value});
}

/**
 * Parse the data for a Modbus -
 * Preset Multiple Registers (FC=16)
 *
 * @param {buffer} data the data buffer to parse.
 * @param {function} next the function to call next.
 */
function _readFC16(data, next) {
    var dataAddress = data.readUInt16BE(2);
    var length = data.readUInt16BE(4);

    if (next)
        next(null, {"address": dataAddress, "length": length});
}

/**
 * Class making ModbusRTU calls fun and easy.
 *
 * @param {SerialPort} port the serial port to use.
 */
var ModbusRTU = function (port) {
    // the serial port to use
    this._port = port;

    // state variables
    this._nextAddress = null; // unit address of current function call.
    this._nextCode = null; // function code of current function call.
    this._nextLength = 0; // number of bytes in current answer.
    this._next = null; // the function to call on success or failure

    this._unitID = 1;
};

/**
 * Open the serial port and register Modbus parsers
 *
 * @param {function} callback the function to call next on open success
 *      of failure.
 */
ModbusRTU.prototype.open = function (callback) {
    var modbus = this;

    // open the serial port
    modbus._port.open(function (error) {
        if (error) {
            /* On serial port open error
            * call next function
            */
            if (callback)
                callback(error);
        } else {
            /* On serial port open OK
             * call next function
             */
            if (callback)
                callback(error);

            /* On serial port success
             * register the modbus parser functions
             */
            modbus._port.on('data', function(data) {
                // set locale helpers variables
                var length = modbus._nextLength;
                var next =  modbus._next;

                /* check incoming data
                 */

                /* check message length
                 * if we do not expect this data
                 * raise an error
                 */

                if (data.length != length) {
                    error = "Data length error, expected " +
                        length + " got " + data.length;
                    if (next)
                        next(error);
                    return;
                }

                var address = data.readUInt8(0);
                var code = data.readUInt8(1);

                /* check message address and code
                 * if we do not expect this message
                 * raise an error
                 */
                if (address != modbus._nextAddress || code != modbus._nextCode) {
                    error = "Unexpected data error, expected " +
                        modbus._nextAddress + " got " + address;
                    if (next)
                        next(error);
                    return;
                }

                // data is OK - clear state variables
                modbus._nextAddress = null;
                modbus._nextCode = null;
                modbus._next = null;

                // if response is encoded as ascii
                if( modbus._ascii === false ) {
                    /* check message CRC
                     * if CRC is bad raise an error
                     */
                    var crcIn = data.readUInt16LE(length - 2);
                    var crc = _CRC16(data, length - 2);

                    if (crcIn != crc) {
                        error = "CRC error";
                        if (next)
                            next(error);
                        return;
                    }
                } else {
                    /* check message LRC
                     * if LRC is bad raise an error
                     */
                     var lrcIn = data.readUInt8(data.length - 1);
                     var lrc = _LRC(data, data.length - 1);

                     if (lrcIn != lrc) {
                         error = "LRC error";
                         if (next)
                             next(error);
                         return;
                     }
                }

                /* parse incoming data
                 */

                /* Read Coil Status (FC=01)
                 * Read Input Status (FC=02)
                 */
                if (code == 2 || code == 1) {
                    _readFC2(data, next);
                }

                /* Read Input Registers (FC=04)
                 * Read Holding Registers (FC=03)
                 */
                if (code == 4 || code == 3) {
                    _readFC4(data, next);
                }

                /* Force Single Coil (FC=05)
                 */
                if (code == 5) {
                    _readFC5(data, next);
                }

                /* Preset Single Register (FC=06)
                 */
                if (code == 6) {
                    _readFC6(data, next);
                }

                // Preset Multiple Registers (FC=16)
                if (code == 16) {
                    _readFC16(data, next);
                }
            });
        }
    });
};

/**
 * Write a Modbus "Read Coil Status" (FC=01) to serial port.
 *
 * @param {number} address the slave unit address.
 * @param {number} dataAddress the Data Address of the first coil.
 * @param {number} length the total number of coils requested.
 * @param {function} next the function to call next.
 */
ModbusRTU.prototype.writeFC1 = function (address, dataAddress, length, next) {
    this.writeFC2(address, dataAddress, length, next, 1);
}

/**
 * Write a Modbus "Read Input Status" (FC=02) to serial port.
 *
 * @param {number} address the slave unit address.
 * @param {number} dataAddress the Data Address of the first digital input.
 * @param {number} length the total number of digital inputs requested.
 * @param {function} next the function to call next.
 */
ModbusRTU.prototype.writeFC2 = function (address, dataAddress, length, next, code) {
    // function code defaults to 2
    if (!code) code = 2;

    // set state variables
    this._nextAddress = address;
    this._nextCode = code;
    if( this._ascii === false ) {
        this._nextLength = 3 + parseInt((length - 1) / 8 + 1) + 2;
    } else {}
        this._nextLength = 3 + parseInt((length - 1) / 8 + 1) + 1;
    }
    this._next = next;

    var codeLength = 6;
    if( this._ascii === false ) {
        var buf = new Buffer(codeLength + 2); // add 2 crc bytes
    } else {}
        var buf = new Buffer(codeLength + 1); // add 1 lrc bytes
    }

    buf.writeUInt8(address, 0);
    buf.writeUInt8(code, 1);
    buf.writeUInt16BE(dataAddress, 2);
    buf.writeUInt16BE(length, 4);

    // calculate and add crc or lrc byte to buffer
    if( this._ascii === true ) {
        _CRC16(buf, codeLength);
    } else {
        _LRC(buf, codeLength);
    }

    // write buffer to serial port
    this._port.write(buf);
}

/**
 * Write a Modbus "Read Holding Registers" (FC=03) to serial port.
 *
 * @param {number} address the slave unit address.
 * @param {number} dataAddress the Data Address of the first register.
 * @param {number} length the total number of registers requested.
 * @param {function} next the function to call next.
 */
ModbusRTU.prototype.writeFC3 = function (address, dataAddress, length, next) {
    this.writeFC4(address, dataAddress, length, next, 3);
}

/**
 * Write a Modbus "Read Input Registers" (FC=04) to serial port.
 *
 * @param {number} address the slave unit address.
 * @param {number} dataAddress the Data Address of the first register.
 * @param {number} length the total number of registers requested.
 * @param {function} next the function to call next.
 */
ModbusRTU.prototype.writeFC4 = function (address, dataAddress, length, next, code) {
    // function code defaults to 4
    if (!code) code = 4;

    // set state variables
    this._nextAddress = address;
    this._nextCode = code;
    if( this._ascii === false ) {
        this._nextLength = 3 + 2 * length + 2;
    } else {}
        this._nextLength = 3 + 2 * length + 1;
    }
    this._next = next;

    var codeLength = 6;
    if( this._ascii === false ) {
        var buf = new Buffer(codeLength + 2); // add 2 crc bytes
    } else {}
        var buf = new Buffer(codeLength + 1); // add 1 lrc bytes
    }

    buf.writeUInt8(address, 0);
    buf.writeUInt8(code, 1);
    buf.writeUInt16BE(dataAddress, 2);
    buf.writeUInt16BE(length, 4);

    // calculate and add crc or lrc byte to buffer
    if( this._ascii === true ) {
        _CRC16(buf, codeLength);
    } else {
        _LRC(buf, codeLength);
    }

    // write buffer to serial port
    this._port.write(buf);
}

/**
 * Write a Modbus "Force Single Coil" (FC=05) to serial port.
 *
 * @param {number} address the slave unit address.
 * @param {number} dataAddress the Data Address of the first register.
 * @param {number} state the state to write to the coil (true / false).
 * @param {function} next the function to call next.
 */
ModbusRTU.prototype.writeFC5 =  function (address, dataAddress, state, next) {
    var code = 5;

    // set state variables
    this._nextAddress = address;
    this._nextCode = code;
    this._nextLength = 8;
    if( this._ascii === false ) {
        this._nextLength = 8;
    } else {}
        this._nextLength = 7;
    }
    this._next = next;

    var codeLength = 6;
    if( this._ascii === false ) {
        var buf = new Buffer(codeLength + 2); // add 2 crc bytes
    } else {}
        var buf = new Buffer(codeLength + 1); // add 1 lrc bytes
    }

    buf.writeUInt8(address, 0);
    buf.writeUInt8(code, 1);
    buf.writeUInt16BE(dataAddress, 2);

    if (state) {
        buf.writeUInt16BE(0xff00, 4);
    } else {
        buf.writeUInt16BE(0x0000, 4);
    }

    // calculate and add crc or lrc byte to buffer
    if( this._ascii === true ) {
        _CRC16(buf, codeLength);
    } else {
        _LRC(buf, codeLength);
    }

    // write buffer to serial port
    this._port.write(buf);
}


/**
 * Write a Modbus "Preset Single Register " (FC=6) to serial port.
 *
 * @param {number} address the slave unit address.
 * @param {value} number the value to write to a specific register.
 * @param {function} next the function to call next.
 */
ModbusRTU.prototype.writeFC6 =  function (address, dataAddress, value, next) {
    var code = 6;

    // set state variables
    this._nextAddress = address;
    this._nextCode = code;
    if( this._ascii === false ) {
        this._nextLength = 8;
    } else {}
        this._nextLength = 7;
    }
    this._next = next;

    var codeLength = 6; // 1B deviceAddress + 1B functionCode + 2B dataAddress + 2B value
    if( this._ascii === false ) {
        var buf = new Buffer(codeLength + 2); // add 2 crc bytes
    } else {}
        var buf = new Buffer(codeLength + 1); // add 1 lrc bytes
    }

    buf.writeUInt8(address, 0);
    buf.writeUInt8(code, 1);
    buf.writeUInt16BE(dataAddress, 2);

    buf.writeUInt16BE(value, 4);

    // calculate and add crc or lrc byte to buffer
    if( this._ascii === true ) {
        _CRC16(buf, codeLength);
    } else {
        _LRC(buf, codeLength);
    }

    // write buffer to serial port
    this._port.write(buf);
}



/**
 * Write a Modbus "Preset Multiple Registers" (FC=16) to serial port.
 *
 * @param {number} address the slave unit address.
 * @param {number} dataAddress the Data Address of the first register.
 * @param {array} array the array of values to write to registers.
 * @param {function} next the function to call next.
 */
ModbusRTU.prototype.writeFC16 =  function (address, dataAddress, array, next) {
    var code = 16;

    // set state variables
    this._nextAddress = address;
    this._nextCode = code;
    if( this._ascii === false ) {
        this._nextLength = 8;
    } else {}
        this._nextLength = 7;
    }
    this._next = next;

    var codeLength = 7 + 2 * array.length;
    if( this._ascii === false ) {
        var buf = new Buffer(codeLength + 2); // add 2 crc bytes
    } else {}
        var buf = new Buffer(codeLength + 1); // add 1 lrc bytes
    }

    buf.writeUInt8(address, 0);
    buf.writeUInt8(code, 1);
    buf.writeUInt16BE(dataAddress, 2);
    buf.writeUInt16BE(array.length, 4);
    buf.writeUInt8(array.length * 2, 6);

    for (var i = 0; i < array.length; i++) {
        buf.writeUInt16BE(array[i], 7 + 2 * i);
    }

    // calculate and add crc or lrc byte to buffer
    if( this._ascii === true ) {
        _CRC16(buf, codeLength);
    } else {
        _LRC(buf, codeLength);
    }

    // write buffer to serial port
    this._port.write(buf);
}

// add the connection shorthand API
require('./apis/connection')(ModbusRTU);

// add the promise API
require('./apis/promise')(ModbusRTU);

// exports
module.exports = ModbusRTU;
module.exports.TestPort = require('./ports/testport');
module.exports.TcpPort = require('./ports/tcpport');
module.exports.TelnetPort = require('./ports/telnetport');
module.exports.C701Port = require('./ports/c701port');
