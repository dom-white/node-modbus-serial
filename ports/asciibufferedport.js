'use strict';
var util = require('util');
var events = require('events');
var SerialPort = require("serialport").SerialPort;

/**
 * calculate lrc
 *
 * @param {buffer} buf the buffer to to crc on.
 * @return {number} the calculated lrc
 */
function calculateLrc (buf) {
    var length = buf.length - 1;

    var lrc = 0;
    for (var i = 0; i < length; i++) {
         lrc += buf[i] & 0xFF;
     }

     return ((lrc ^ 0xFF) + 1) & 0xFF;
}

/**
 * Ascii encode a 'request' buffer and return it.
 *
 * @param {buffer} buf the data buffer to encode.
 * @return {buffer} the ascii encoded buffer
 */
function asciiEncodeRequestBuffer(buf) {

    // create a new buffer of the correct size
    var bufAscii = new Buffer(buf.length*2 + 3); // 1 byte start delimit + x2 data as ascii encoded + 2 lrc + 2 end delimit

    // create the ascii payload
    bufAscii.write(':', 0);
    bufAscii.write(buf.toString('hex', 0, buf.length).toUpperCase(), 1);
    bufAscii.write('\r', bufAscii.length-2);
    bufAscii.write('\n', bufAscii.length-1);

    return bufAscii;
}

/**
 * Ascii decode a 'response' buffer and return it.
 *
 * @param {buffer} buf the ascii data buffer to decode.
 * @return {buffer} the decoded buffer
 */
function asciiDecodeResponseBuffer(bufAscii) {

    // create a new buffer of the correct size (based on ascii encoded buffer length)
    var bufDecoded = new Buffer( (bufAscii.length-3)/2 );

    // decode into new buffer (removing delimiters at start and end)
    for (var i = 0; i < (bufAscii.length-3)/2; i++) {
        bufDecoded.write(String.fromCharCode(bufAscii.readUInt8(i*2+1), bufAscii.readUInt8(i*2+2)), i, 1, 'hex');
    }

    return bufDecoded;
}

/**
 * check if a buffer chunk can be a modbus answer
 *
 * @param {buffer} buf the buffer to check.
 * @return {boolean} if the buffer can be an answer
 */
function checkData(modbus, buf) {

    // calculate lrc
    var lrcIn = buf.readUInt8(buf.length - 1);

    // check buffer unit-id, command and crc
    return (buf[0] == modbus._id &&
        buf[1] == modbus._cmd &&
        lrcIn == calculateLrc(buf));
}

/**
 * Simulate a modbus-ascii port using buffered serial connection
 */
var AsciiBufferedPort = function(path, options) {
    var modbus = this;

    // options
    if (typeof(options) == 'undefined') options = {};

    // internal buffer
    this._buffer = new Buffer(0);
    this._id = 0;
    this._cmd = 0;
    this._length = 0;

    // create the SerialPort
    this._client= new SerialPort(path, options);

    // register the port data event
    this._client.on('data', function(data) {
        /* add data to buffer
         */
        modbus._buffer = Buffer.concat([modbus._buffer, data]);

        /* check if buffer include a complete modbus answer
         */
        var length = modbus._length;
        var bufferLength = modbus._buffer.length ;

        // check data length
        if (bufferLength < 6 || length < 6) return;

        // loop and check length-sized buffer chunks
        for (var i = 0; i < (bufferLength - length + 1); i++) {
            // cut a length of bytes from buffer
            var _data = modbus._buffer.slice(i, i + length);

            // if it looks like we have all the data
            if (_data.length === modbus._length) {

                // ascii decode buffer
                var _decodedData = asciiDecodeResponseBuffer(_data);

                // check if this is the data we are waiting for
                if (checkData(modbus, _decodedData)) {
                    // adjust i to end of data chunk
                    i = i + length;

                    // emit a data signal
                    modbus.emit('data', _decodedData);
                }
            }
        }

        /* cut checked data from buffer
         */
        if (i) {
            modbus._buffer = modbus._buffer.slice(i);
        }
    });

    events.call(this);
}
util.inherits(AsciiBufferedPort, events);

/**
 * Simulate successful port open
 */
AsciiBufferedPort.prototype.open = function (callback) {
    this._client.open(callback);
}

/**
 * Simulate successful close port
 */
AsciiBufferedPort.prototype.close = function (callback) {
    this._client.close(callback);
}
/**
 * Send data to a modbus slave via telnet server
 */
AsciiBufferedPort.prototype.write = function (data) {
    // check data length
    if (data.length < 5) {
        // raise an error ?
        return;
    }

    // remember current unit and command
    this._id = data[0];
    this._cmd = data[1];

    // calculate expected answer length (based on ascii encoding)
    switch (this._cmd) {
        case 1:
        case 2:
            var length = data.readUInt16BE(4);
            this._length = (3 + parseInt((length - 1) / 8 + 1) + 2) * 2 + 1;
            break;
        case 3:
        case 4:
            var length = data.readUInt16BE(4);
            this._length = (3 + 2 * length + 2) * 2 + 1;
            break;
        case 5:
        case 6:
        case 16:
            this._length = (6 + 2) * 2 + 1;
            break;
        default:
            // raise and error ?
            this._length = 0;
            break;
    }

    // ascii encode buffer
    var _encodedData = asciiEncodeRequestBuffer(data);

    // send buffer to slave
    this._client.write(_encodedData);
}

module.exports = AsciiBufferedPort;
