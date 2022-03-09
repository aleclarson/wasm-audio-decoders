(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["opus-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var Worker__default = /*#__PURE__*/_interopDefaultLegacy(Worker);

  const compiledWasm = new WeakMap();

  class WASMAudioDecoderCommon {
    constructor(wasm) {
      this._wasm = wasm;

      this._pointers = new Set();
    }

    get wasm() {
      return this._wasm;
    }

    static async initWASMAudioDecoder() {
      // instantiate wasm code as singleton
      if (!this._wasm) {
        // new decoder instance
        if (this._isWebWorker) {
          // web worker
          this._wasm = new this._EmscriptenWASM(WASMAudioDecoderCommon);
        } else {
          // main thread
          if (compiledWasm.has(this._EmscriptenWASM)) {
            // reuse existing compilation
            this._wasm = compiledWasm.get(this._EmscriptenWASM);
          } else {
            // first compilation
            this._wasm = new this._EmscriptenWASM(WASMAudioDecoderCommon);
            compiledWasm.set(this._EmscriptenWASM, this._wasm);
          }
        }
      }

      await this._wasm.ready;

      const common = new WASMAudioDecoderCommon(this._wasm);

      [this._inputPtr, this._input] = common.allocateTypedArray(
        this._inputPtrSize,
        Uint8Array
      );

      // output buffer
      [this._outputPtr, this._output] = common.allocateTypedArray(
        this._outputChannels * this._outputPtrSize,
        Float32Array
      );

      return common;
    }

    static concatFloat32(buffers, length) {
      const ret = new Float32Array(length);

      let offset = 0;
      for (const buf of buffers) {
        ret.set(buf, offset);
        offset += buf.length;
      }

      return ret;
    }

    static getDecodedAudio(channelData, samplesDecoded, sampleRate) {
      return {
        channelData,
        samplesDecoded,
        sampleRate,
      };
    }

    static getDecodedAudioConcat(channelData, samplesDecoded, sampleRate) {
      return WASMAudioDecoderCommon.getDecodedAudio(
        channelData.map((data) =>
          WASMAudioDecoderCommon.concatFloat32(data, samplesDecoded)
        ),
        samplesDecoded,
        sampleRate
      );
    }

    static getDecodedAudioMultiChannel(
      input,
      channelsDecoded,
      samplesDecoded,
      sampleRate
    ) {
      const channelData = [];

      for (let i = 0; i < channelsDecoded; i++) {
        const channel = [];
        for (let j = 0; j < input.length; j++) {
          channel.push(input[j][i]);
        }
        channelData.push(
          WASMAudioDecoderCommon.concatFloat32(channel, samplesDecoded)
        );
      }

      return WASMAudioDecoderCommon.getDecodedAudio(
        channelData,
        samplesDecoded,
        sampleRate
      );
    }

    getOutputChannels(outputData, channelsDecoded, samplesDecoded) {
      const output = [];

      for (let i = 0; i < channelsDecoded; i++)
        output.push(
          outputData.slice(
            i * samplesDecoded,
            i * samplesDecoded + samplesDecoded
          )
        );

      return output;
    }

    allocateTypedArray(length, TypedArray) {
      const pointer = this._wasm._malloc(TypedArray.BYTES_PER_ELEMENT * length);
      const array = new TypedArray(this._wasm.HEAP, pointer, length);

      this._pointers.add(pointer);
      return [pointer, array];
    }

    free() {
      for (const pointer of this._pointers) this._wasm._free(pointer);
      this._pointers.clear();
    }

    /*
     ******************
     * Compression Code
     ******************
     */

    static inflateYencString(source, dest) {
      const output = new Uint8Array(source.length);

      let continued = false,
        byteIndex = 0,
        byte;

      for (let i = 0; i < source.length; i++) {
        byte = source.charCodeAt(i);

        if (byte === 13 || byte === 10) continue;

        if (byte === 61 && !continued) {
          continued = true;
          continue;
        }

        if (continued) {
          continued = false;
          byte -= 64;
        }

        output[byteIndex++] = byte < 42 && byte > 0 ? byte + 214 : byte - 42;
      }

      return WASMAudioDecoderCommon.inflate(output.subarray(0, byteIndex), dest);
    }

    static inflate(source, dest) {
      const TINF_OK = 0;
      const TINF_DATA_ERROR = -3;

      const uint8Array = Uint8Array;
      const uint16Array = Uint16Array;

      class Tree {
        constructor() {
          this.t = new uint16Array(16); /* table of code length counts */
          this.trans = new uint16Array(
            288
          ); /* code -> symbol translation table */
        }
      }

      class Data {
        constructor(source, dest) {
          this.s = source;
          this.i = 0;
          this.t = 0;
          this.bitcount = 0;

          this.dest = dest;
          this.destLen = 0;

          this.ltree = new Tree(); /* dynamic length/symbol tree */
          this.dtree = new Tree(); /* dynamic distance tree */
        }
      }

      /* --------------------------------------------------- *
       * -- uninitialized global data (static structures) -- *
       * --------------------------------------------------- */

      const sltree = new Tree();
      const sdtree = new Tree();

      /* extra bits and base tables for length codes */
      const length_bits = new uint8Array(30);
      const length_base = new uint16Array(30);

      /* extra bits and base tables for distance codes */
      const dist_bits = new uint8Array(30);
      const dist_base = new uint16Array(30);

      /* special ordering of code length codes */
      const clcidx = new uint8Array([
        16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
      ]);

      /* used by tinf_decode_trees, avoids allocations every call */
      const code_tree = new Tree();
      const lengths = new uint8Array(288 + 32);

      /* ----------------------- *
       * -- utility functions -- *
       * ----------------------- */

      /* build extra bits and base tables */
      const tinf_build_bits_base = (bits, base, delta, first) => {
        let i, sum;

        /* build bits table */
        for (i = 0; i < delta; ++i) bits[i] = 0;
        for (i = 0; i < 30 - delta; ++i) bits[i + delta] = (i / delta) | 0;

        /* build base table */
        for (sum = first, i = 0; i < 30; ++i) {
          base[i] = sum;
          sum += 1 << bits[i];
        }
      };

      /* build the fixed huffman trees */
      const tinf_build_fixed_trees = (lt, dt) => {
        let i;

        /* build fixed length tree */
        for (i = 0; i < 7; ++i) lt.t[i] = 0;

        lt.t[7] = 24;
        lt.t[8] = 152;
        lt.t[9] = 112;

        for (i = 0; i < 24; ++i) lt.trans[i] = 256 + i;
        for (i = 0; i < 144; ++i) lt.trans[24 + i] = i;
        for (i = 0; i < 8; ++i) lt.trans[24 + 144 + i] = 280 + i;
        for (i = 0; i < 112; ++i) lt.trans[24 + 144 + 8 + i] = 144 + i;

        /* build fixed distance tree */
        for (i = 0; i < 5; ++i) dt.t[i] = 0;

        dt.t[5] = 32;

        for (i = 0; i < 32; ++i) dt.trans[i] = i;
      };

      /* given an array of code lengths, build a tree */
      const offs = new uint16Array(16);

      const tinf_build_tree = (t, lengths, off, num) => {
        let i, sum;

        /* clear code length count table */
        for (i = 0; i < 16; ++i) t.t[i] = 0;

        /* scan symbol lengths, and sum code length counts */
        for (i = 0; i < num; ++i) t.t[lengths[off + i]]++;

        t.t[0] = 0;

        /* compute offset table for distribution sort */
        for (sum = 0, i = 0; i < 16; ++i) {
          offs[i] = sum;
          sum += t.t[i];
        }

        /* create code->symbol translation table (symbols sorted by code) */
        for (i = 0; i < num; ++i) {
          if (lengths[off + i]) t.trans[offs[lengths[off + i]]++] = i;
        }
      };

      /* ---------------------- *
       * -- decode functions -- *
       * ---------------------- */

      /* get one bit from source stream */
      const tinf_getbit = (d) => {
        /* check if tag is empty */
        if (!d.bitcount--) {
          /* load next tag */
          d.t = d.s[d.i++];
          d.bitcount = 7;
        }

        /* shift bit out of tag */
        const bit = d.t & 1;
        d.t >>>= 1;

        return bit;
      };

      /* read a num bit value from a stream and add base */
      const tinf_read_bits = (d, num, base) => {
        if (!num) return base;

        while (d.bitcount < 24) {
          d.t |= d.s[d.i++] << d.bitcount;
          d.bitcount += 8;
        }

        const val = d.t & (0xffff >>> (16 - num));
        d.t >>>= num;
        d.bitcount -= num;
        return val + base;
      };

      /* given a data stream and a tree, decode a symbol */
      const tinf_decode_symbol = (d, t) => {
        while (d.bitcount < 24) {
          d.t |= d.s[d.i++] << d.bitcount;
          d.bitcount += 8;
        }

        let sum = 0,
          cur = 0,
          len = 0,
          tag = d.t;

        /* get more bits while code value is above sum */
        do {
          cur = 2 * cur + (tag & 1);
          tag >>>= 1;
          ++len;

          sum += t.t[len];
          cur -= t.t[len];
        } while (cur >= 0);

        d.t = tag;
        d.bitcount -= len;

        return t.trans[sum + cur];
      };

      /* given a data stream, decode dynamic trees from it */
      const tinf_decode_trees = (d, lt, dt) => {
        let i, length;

        /* get 5 bits HLIT (257-286) */
        const hlit = tinf_read_bits(d, 5, 257);

        /* get 5 bits HDIST (1-32) */
        const hdist = tinf_read_bits(d, 5, 1);

        /* get 4 bits HCLEN (4-19) */
        const hclen = tinf_read_bits(d, 4, 4);

        for (i = 0; i < 19; ++i) lengths[i] = 0;

        /* read code lengths for code length alphabet */
        for (i = 0; i < hclen; ++i) {
          /* get 3 bits code length (0-7) */
          const clen = tinf_read_bits(d, 3, 0);
          lengths[clcidx[i]] = clen;
        }

        /* build code length tree */
        tinf_build_tree(code_tree, lengths, 0, 19);

        /* decode code lengths for the dynamic trees */
        for (let num = 0; num < hlit + hdist; ) {
          const sym = tinf_decode_symbol(d, code_tree);

          switch (sym) {
            case 16:
              /* copy previous code length 3-6 times (read 2 bits) */
              const prev = lengths[num - 1];
              for (length = tinf_read_bits(d, 2, 3); length; --length) {
                lengths[num++] = prev;
              }
              break;
            case 17:
              /* repeat code length 0 for 3-10 times (read 3 bits) */
              for (length = tinf_read_bits(d, 3, 3); length; --length) {
                lengths[num++] = 0;
              }
              break;
            case 18:
              /* repeat code length 0 for 11-138 times (read 7 bits) */
              for (length = tinf_read_bits(d, 7, 11); length; --length) {
                lengths[num++] = 0;
              }
              break;
            default:
              /* values 0-15 represent the actual code lengths */
              lengths[num++] = sym;
              break;
          }
        }

        /* build dynamic trees */
        tinf_build_tree(lt, lengths, 0, hlit);
        tinf_build_tree(dt, lengths, hlit, hdist);
      };

      /* ----------------------------- *
       * -- block inflate functions -- *
       * ----------------------------- */

      /* given a stream and two trees, inflate a block of data */
      const tinf_inflate_block_data = (d, lt, dt) => {
        while (1) {
          let sym = tinf_decode_symbol(d, lt);

          /* check for end of block */
          if (sym === 256) {
            return TINF_OK;
          }

          if (sym < 256) {
            d.dest[d.destLen++] = sym;
          } else {
            let length, dist, offs;

            sym -= 257;

            /* possibly get more bits from length code */
            length = tinf_read_bits(d, length_bits[sym], length_base[sym]);

            dist = tinf_decode_symbol(d, dt);

            /* possibly get more bits from distance code */
            offs =
              d.destLen - tinf_read_bits(d, dist_bits[dist], dist_base[dist]);

            /* copy match */
            for (let i = offs; i < offs + length; ++i) {
              d.dest[d.destLen++] = d.dest[i];
            }
          }
        }
      };

      /* inflate an uncompressed block of data */
      const tinf_inflate_uncompressed_block = (d) => {
        let length, invlength;

        /* unread from bitbuffer */
        while (d.bitcount > 8) {
          d.i--;
          d.bitcount -= 8;
        }

        /* get length */
        length = d.s[d.i + 1];
        length = 256 * length + d.s[d.i];

        /* get one's complement of length */
        invlength = d.s[d.i + 3];
        invlength = 256 * invlength + d.s[d.i + 2];

        /* check length */
        if (length !== (~invlength & 0x0000ffff)) return TINF_DATA_ERROR;

        d.i += 4;

        /* copy block */
        for (let i = length; i; --i) d.dest[d.destLen++] = d.s[d.i++];

        /* make sure we start next block on a byte boundary */
        d.bitcount = 0;

        return TINF_OK;
      };

      /* -------------------- *
       * -- initialization -- *
       * -------------------- */

      /* build fixed huffman trees */
      tinf_build_fixed_trees(sltree, sdtree);

      /* build extra bits and base tables */
      tinf_build_bits_base(length_bits, length_base, 4, 3);
      tinf_build_bits_base(dist_bits, dist_base, 2, 1);

      /* fix a special case */
      length_bits[28] = 0;
      length_base[28] = 258;

      const d = new Data(source, dest);
      let bfinal, btype, res;

      do {
        /* read final block flag */
        bfinal = tinf_getbit(d);

        /* read block type (2 bits) */
        btype = tinf_read_bits(d, 2, 0);

        /* decompress block */
        switch (btype) {
          case 0:
            /* decompress uncompressed block */
            res = tinf_inflate_uncompressed_block(d);
            break;
          case 1:
            /* decompress block with fixed huffman trees */
            res = tinf_inflate_block_data(d, sltree, sdtree);
            break;
          case 2:
            /* decompress block with dynamic huffman trees */
            tinf_decode_trees(d, d.ltree, d.dtree);
            res = tinf_inflate_block_data(d, d.ltree, d.dtree);
            break;
          default:
            res = TINF_DATA_ERROR;
        }

        if (res !== TINF_OK) throw new Error("Data error");
      } while (!bfinal);

      if (d.destLen < d.dest.length) {
        if (typeof d.dest.slice === "function") return d.dest.slice(0, d.destLen);
        else return d.dest.subarray(0, d.destLen);
      }

      return d.dest;
    }
  }

  class WASMAudioDecoderWorker extends Worker__default["default"] {
    constructor(options, Decoder, EmscriptenWASM) {
      const webworkerSourceCode =
        "'use strict';" +
        // dependencies need to be manually resolved when stringifying this function
        `(${((_options, _Decoder, _WASMAudioDecoderCommon, _EmscriptenWASM) => {
        // We're in a Web Worker
        _Decoder.WASMAudioDecoderCommon = _WASMAudioDecoderCommon;
        _Decoder.EmscriptenWASM = _EmscriptenWASM;
        _Decoder.isWebWorker = true;

        const decoder = new _Decoder(_options);

        const detachBuffers = (buffer) =>
          Array.isArray(buffer)
            ? buffer.map((buffer) => new Uint8Array(buffer))
            : new Uint8Array(buffer);

        self.onmessage = ({ data: { id, command, data } }) => {
          switch (command) {
            case "ready":
              decoder.ready.then(() => {
                self.postMessage({
                  id,
                });
              });
              break;
            case "free":
              decoder.free();
              self.postMessage({
                id,
              });
              break;
            case "reset":
              decoder.reset().then(() => {
                self.postMessage({
                  id,
                });
              });
              break;
            case "decode":
            case "decodeFrame":
            case "decodeFrames":
              const { channelData, samplesDecoded, sampleRate } = decoder[
                command
              ](detachBuffers(data));

              self.postMessage(
                {
                  id,
                  channelData,
                  samplesDecoded,
                  sampleRate,
                },
                // The "transferList" parameter transfers ownership of channel data to main thread,
                // which avoids copying memory.
                channelData.map((channel) => channel.buffer)
              );
              break;
            default:
              this.console.error("Unknown command sent to worker: " + command);
          }
        };
      }).toString()})(${JSON.stringify(
        options
      )}, ${Decoder}, ${WASMAudioDecoderCommon}, ${EmscriptenWASM})`;

      const type = "text/javascript";
      let source;

      try {
        // browser
        source = URL.createObjectURL(new Blob([webworkerSourceCode], { type }));
      } catch {
        // nodejs
        source = `data:${type};base64,${Buffer.from(webworkerSourceCode).toString(
        "base64"
      )}`;
      }

      super(source);

      this._id = Number.MIN_SAFE_INTEGER;
      this._enqueuedOperations = new Map();

      this.onmessage = ({ data }) => {
        const { id, ...rest } = data;
        this._enqueuedOperations.get(id)(rest);
        this._enqueuedOperations.delete(id);
      };
    }

    async _postToDecoder(command, data) {
      return new Promise((resolve) => {
        this.postMessage({
          command,
          id: this._id,
          data,
        });

        this._enqueuedOperations.set(this._id++, resolve);
      });
    }

    get ready() {
      return this._postToDecoder("ready");
    }

    async free() {
      await this._postToDecoder("free").finally(() => {
        this.terminate();
      });
    }

    async reset() {
      await this._postToDecoder("reset");
    }
  }

  /* **************************************************
   * This file is auto-generated during the build process.
   * Any edits to this file will be overwritten.
   ****************************************************/

  class EmscriptenWASM {
  constructor(WASMAudioDecoderCommon) {
  var Module = Module;

  function ready() {}

  Module = {};

  function abort(what) {
   throw what;
  }

  for (var base64ReverseLookup = new Uint8Array(123), i = 25; i >= 0; --i) {
   base64ReverseLookup[48 + i] = 52 + i;
   base64ReverseLookup[65 + i] = i;
   base64ReverseLookup[97 + i] = 26 + i;
  }

  base64ReverseLookup[43] = 62;

  base64ReverseLookup[47] = 63;

  Module["wasm"] = WASMAudioDecoderCommon.inflateYencString(`Æç7¶¿ÿ¡¡Ýé	!rsNïYs~µÌR»¹¼R´¾R©7Sô×æVÏÔÓ6ÓP[êL1;\`tpeÕ»¶Û®¯«_,1Z>¹¶GZr¶ê 6Q[0Ý² ¡ Ü]Å_²«Nû((wtÈë´¤!¥çÈ#¤¿ùé[Ó~Tó%ó5ß&£Kç Wã lÿøõoyâv¹Ewå;uuóÁÖúÕÙ"MtïÝ´FUw§ËìQ=@¥üH7Å=MÖVÎt°¾ºûÀ	¥¿dÙ|£Ëe|²eßÆÑó½ù&(W%'¹T¨éz~ùÉÕ½ÎOsT×NýôÏû¼þÅÇÎûrý¢d][eÉÉvÕsÒò"ÕwÎßQÓÑ0×ÞàÚßÓÿ×ÞÙ¹y=@óYQs|Nó¤]¢ï¥©¹ýx]O)[W§Û¡l|ON)sÎcÉ6T¼ßÎ\\ )Ô¤srµßñ-¯luAmÜíoùÔÓ§ÏÒ¤æ A¨@TwdKGczgHüºÕ~¸~¢Õr$C?ò}ç\`øoÒhcÒÓ¦|Uâ;ï¨9SñØÞÜÄ,¬øÕ÷ùÕõùäÕù¤ÕùùýCiwA&£_ ÝÚÄ0iãÄÝÕXiåÄÝ­ÕkieÞÄHÝíÕieäÄHÏñ16¢cóýþMHÈCy\`kÉ>_·*ê¼ÑRÑ«Ô@ßQa°·Õk5¿»á¸ÎÇOqTDiøüM¿þùÔqTÿSËÓ|q÷q_øò=}Øü#|å@T¶~ø½ÕKÕ?6²=@Ê~®ÎyãwL²û2ÿ«0Â3ÞÝ:TçÏº ¨ÄP_b£ÆãÏKj\\R6¶´I¼l¿zd¤|Gçk½oý5=@pÕA9jXªÙÒ?I¡ª; ûË¨øÌ74^üËp_×"bSäí¬±/ëMGjVGê^Gä>7ÅCÈW6ùÀõÔ."ÏG*tÚ¤mß]¦Ìj¿0ÊGªu1_HRnwk×2¡^9ç°þwDgâÄQyè<Yûf®<óJÎu\`m\`Y9açp)TÑ×^bõï%9%oÕùU9OÔÎ\\ZfV~d& (gÓ{Ë	£Ñ¶R¨_u}ìñ)Í1éÍôÖÇrPü³³ÕÌÉ>	Cv^=}=}³0ò¾>id¹·ÝNl¿?ØÃÕ7ZûÀ>aTÑðC¥Æ)ãÊqöx¡Aè>¿8	d÷¯çßú)Ìájö"ÂÁ áÀ·HI£º:ð´!#¯ÄÒ=@Üä	~D÷Ý.UïØ¨=JæÎï%aU§gß_pËèY8¥·oøÀR£-RïHÙ×<±'ôé&ÏÉÿÂïpÉ¿5ö,QÑÁÜ07µJkäÈa%ï)Á®ÀßZ¤ÿZºQ»N>!YYï/ZÎÚü×©SßxÕ~à|6Ôgià0_jÎUAøþCô^/ÍÒIGíU±dÄ<´Ô<{=JI¶xe©vàä@Üs­g=}ÓçÆw²(Ç83ï x?3V¼Côä°{ädiÆ\`=}ofób¤F=Jpvý{Ú=@]ú®\\Ëå¾·Åpß¥Ä¢\`egDÕç#=@[£Ó"=@×øcßøðì¢ehÕßZ¨OÕEÖ=}¦g,GûGÜÓÕz	Yvµ¡v1äìþëÝ¶m§g¶ÓÓ»Dyí~~à¯-¯Ñl1¶Æòäu¥çÃ³!-mÑrùüj·Ï²a6Ê=MË¥Ì-Çew]Û«a®Ò×Z=@Åz÷ïa´N@*Ã=J=M=M¸tó>üu2D¤·Ày/x µè^òEe_£.e^º7Âf±Öõ=J«=@=M£¿eiÀM¦ñÎbùx!Î¿íÖÔd²ï"õ´Ø.éÛ¦)iÍ=@y}Ë=@PÔ9n~ÝhàW©ço-Eö¸KÖB·é§°íð=ME·d÷\\iLY=}ìÔU£Ñaó&¡Ø$&y5O:=JÖ?¿	êÿAô=@kÚÐËÒËòe\`KÃðéÓ¯.½ÿ=JÎ)'©Q{±´êÂÂýäÖø°=@7»fn£Ö+ÙAã¾ë<ðd9´	ëÖmÈ8ØÿÌ¥ÿRÌ0-Rs¬câ#ùTD]-¢½kMÛE[_3èrÄ^ÉrxØD*PMp£'s?¹¬¼.6;:W «döîl=@m\\ävÇ¶ÔoµÌ_þÇt­£!vÆtØdÃÎÀC.RsJòKÛè(>ÚÂç½6>G¼ÒMkq*Ö9ÈHt_=}w¬Á^r=@ÖÄæ?':ÕLÞ¸=M=Mj$;ü&*ìRð¸÷<7ÃÕÁ>#{78//³pk?ïáÂÛÌ$Þµ%¼ªú´¿¼©{Ã±ävTE×UjfÖ´À\`õr=}MðìmÂÆ:ñu=J$e!.I.Ûî¢AÜêË¿ZlGL0Ø*éc¦+LSK7Ò®^D}ÃF»¹Ø¯pwÆ,L4ïýÌÜÝ¢h=@&vÞÀ3¢Ë¬%%=}ðßA¤<nå'ýUÑYkÜÒ´ÏFÕ<ãÔd¬ðbJísq:®S.Ó¥º[6¾Û+âôk}Ü\`}5»¨ìÆk=MïÜNº.rÊ.PmÚ!>æ¶:öoiÁ_~ÅVNÊæjÀ+­"\`ÕxñCp½maC>Zzã9iÖÚÁþÙÖ²³ÞÔHD­U­ÖÏ Oµ°pÛO^Xò]Ý¹ÜÓh¦­pÃ_ÝöHQ8v¡ºÝÝ6»q!«Üè.ÌT;ñk»ödeßnçMÒFÞÕÅ¬ïó­»§±ãúæË@@.ÜïðKà¯þÀý:ðÀÞ½S@xY¯ÉáQ¢¥íÙP^=J³|qÞ¾ßûàÌªj¾·jôp:#¼Q\`ÒÏKÆÄC2äZxbòdàGH¸Qø¦.ÇøL0)6¼}ÅsoaP[ñN´¬,ùµÏÌÃTßÖmåí,Æþ2tÈZ°·:ºá´Oû?@ÊÑºX23½÷¾y]+?¶ÇWàwÂ½W(ÂZÛ¼MÍ¥PIÅö6 \`/ÛòFTÉ=}W±AÕ«ª<äÍ'tS[cÌUË¨ôBÐÔÇ_ãCfI§Qþ	§±i¢ÊDä¨F =@ÇùEOrb)c­TFÕ_4àæÁîÔ-à1¤\`[~è¨Vö¨p\`yõ28*Þç¿h~2Tr×a¨MÉ%¿¤Þ^!7óëÞ 'dc<^§6:¡ãZ!à¤ç:à°ãE5r6êÀ¹zÁ|¢Y¾áK2DócVL"¯!Ý ð~ê\`<9;]E¤C^÷Dp	#ÌÿÓAìü¬¸5ëlJù\`5h½]öÎt(ph©­ð¢aö"÷×aÈ1æ£t³òìîÞ~/¼t}RZ³@°=}ñ~vÕëÀ¬ÜäáBGäc·¿9vB´nmn­0zM?Õ=MÜÏTBÍëU÷P^«ãæ5$qZÙmþJdÔÐÿ©¯]÷ðv	-f­æøô>6]°]a¹ÂBCgÓ¥ ÖùT¿¾EUÒØªÂq)¿h-èwÓRänWühßãB¤0¿h^Û¸ÐÒKt8Dè²öÛ0ê=@gÕ_ª±Ðç·¤¹°3d^â9KGýC]|1Ë=@¥.bP»¡ý8lÔÆ7Ó	-^TÎ£-êÔytAó¶ÜF©íð·ô¡uKåa,>w¡ÀÌ4±Ò´MûÔ}¬G'ê_Ð	îÖQAt7ß¦\\ÞÉôÐÞñ6½4ºQmYvÕÂ"Ê¼O¾Ö<åo¼TÄG¢.ú§²pTKËCÒÑzl6ìþUoçtê$²5@æ@D,µS°6Ó²ùïÍ$]3èl[?;æ·þOÐ¯²PÀ>ß?ß×¤à.èX7Ê#sV±´¿5½¼6\`þ0WwiÞ)Tâ¥­8=}ë*dÜ@¡´T%ÑºÎrX5Ñø¼t 0*õæ]àËÿægRÝrb­¶{ñÁk=M<&qfaC@/ÞDUqü.z¿¾Ú®þº¤°KÜ.uÇ³¥_ô¶éÞwø|1z,àXó\\ã{6cCvÙ­àÙ\\óAìHåZ0¤v½ò¨-³8d7Ï=}ç§riéõ'ei"A¿ß©)ý	'3&ÙÑÁÀ¶(ë%c5äùÔ+w²û@ÊËàç×àÃU¿Túªÿ\\¸\`¾¯&íN×u|¸Ý=M´ÙUþQãÜ~¦à~=@ÖDeo])RªÄ¤%)þi -TÑãCÌkriÌzàÈÕ%õdÖag{²ÌÒwÞG^K¶ÉÇ6[ù0øyHÞå^Ýð÷õR×e{£3_ÙSs,¶¤=@C~@loz5Ó3ú¤µ³Þ=M.y¤|°Î»õ\\.É5=@7.¯ÎüdÖÈç°§wEÆÅ^P°­¨_§-\`ÔÍw¨Ìâ!¨ÚÒó8_SáM­=@oìUFVüUX8Ò±nÛ{mz5=}Ñ¶¤ÛÏqIÕO0PË¹¾¸µÙ°SPtÂ¿r9K§è\`Ó=}ìþD¾+àxqfÑi}ÊÚTÕØ5ÛOÊ(xWÐw­n¡Ôe×·¿ÀÂt?¶»èF½¾Þ¡ÇJå=}iÏAlá3µ©ýPöVxµ5zAÙz<û¤´©åëláêIô6í¾9;:¤ïÄ0àÉË¯mmý4ËÚ[&£=}lN)Ð #¾¢ö¾\\¤<¿ÑHf[úJï=@UõÎü¥Æ%aÙTÏ{þ!¥Ý1ìÇÊ0',oL7$~bÀÉÓzE±¡téµhìFÄwóO\`èwdçêidÅïÑ_Gæ¦ö=@Þ'¿<fmLÓ5Ê·Ü¡ªdüÆ!Æ±ÆÈ¿÷s¸!;÷»Þ$Ø%gÔ+ðQ¥¥«£pðâòN·[Ñ[Ö®òÐ7´)ØLK²Ð¢m Ir«Ç¿ßMO÷ssç¨à¿$KÑZÂ±+£T_>\`Fó²'ÌÏ&?Öýá: ]båÿ÷¤¼÷¤gÿú(>÷k/§!PßaÜ_ä&äNá7AÙ¯ó%Qlmgsã¨yÖñ^Ø'ñUµÆÛlþ{ùåäÞ°Q¥ü:ÀeiÃÀw8àøæ_´	£WÅ=JcÙB¶WÖL÷ÄüÁuFe³8¬KÓAqÏÒAå&Zî¢çÒwy1;ÔSsþÛ¤-OÖÐiÇXè÷£­tVd­³¤|ÕÿZ«¾ö7u¯ÑWYLHwÅÃ³ö¤æÒÙ×ÐÍø'3_¹í#=@¢ÚÀWðÿc=}D*ýt	Ä8WäëÀæâ¸d ÅS%u^eÃ7=}gé#²=@[°Æ©½!)3ÄýÉß´9©FÞÏÞ»Ëp0¿|iã#åö67ÜÙmO|çn=}YÙÐr#zIòCÂÙÝBÍi$ý¤ñÕ]tyÕöÿ¨ ©/n#d gXº[wUÎWpÜØ¬<Ú1Bäáp«à7Ý}&¶?ª¥é«°ìÖxæ!è_àÄ¨-:xæ÷ =J-·OW57íPhBWDpµüòÚþeZvUt\`Á¤»Å»Ù	î@b§»ûý@¸±ïeR°hÌ¾»N·¬¢ÐÿqûfüÔÂ>ÝpnB[£gÞX\\\`ÐÙ­ÆÖªË¢Økz$4ãikÏÃ\`	ÜÏ$k7#=@^Aw	Åý«,Z3µäÿ²¹))HþÇEýoTHV(Ù­àìvûd3?¥MCq´CúÇ%ðà%RÕR=@$÷¹ËuïÑµ98÷K-Éë¤h{Ù=J¸¼,ïÉrmycÔ?í~À$-"X~£_''Ê¸~z©ì·,§ññÚyà¤¿îë=Mw®ÌÉ?pÎZ¶dckh÷ð¦ÿ!ºD?óð®ÃJÓò[.¹yÂ\`}îN¼^pBVÊGQ&"È¸	bþaØ6Px>× QoJÆzËÿTÌN¯eR¨N	pÚ¥ønòÃ½pì®ý[Ôâ·º<#\\óà&äY?Æ[ã"½¨òµÎñJ8Pê2a®¡1ýòZÄ'¦lM\\ì9ÄÛcp$]C¨h´W×#~=@v+½}³sç"CoÞåüþ·Z×-»óê¶¬*Ö»±ÌtËÍ=@·)5z «tÂñ[@îÏÒÜ¨â*Gë\`dÞ3ÿÊ+­KÃ¶ÙG6-äÖàý=MÐÌ\${íê=};ËóHÀ´¨ý|Ê·aãSEz8­nïªÎ5TÅV,rÑ!sçl	©bUÜóó¹³@=}OQ·Ç¬õKÙ®mhmöÑú*uí²)0½¸b=@Å±þÞ:xÓÍ>:³Û|ÂÉæ¡_oRÚI(dì<ÎÌXeÚ¹\`üªü{}©5l­'÷å=M<_©@FÙ	ä¹Í=@a,p¦É!vìîÂ_OàD=@øÑ/'Êòÿè1º^ho9ÍnàevJë¸@DÞHþ4=}lA8p&%í ²<x·)ó3wy Ü]ÏBJÓ. Ú»e¹±]ÁGÝuS¬g¼yÛD/ëTçª·¨B-)zL´A^zÎGn»t Á\\ 8üm'ôna9¬a=} Ó¹I¦"±Rè[úk¯Ãq }J~4njÏ&SzånPÕÞ!3ÄëuÄA»|j4¦À/ë7¯r´_$zçdñd}­xÜzÏ\\1³õÜ^yWãÎÍ UBcÚHöÇä9Ý-ÅjØ$GbAA5ïì?]®^µóÏ½Âo½W²KßË;=MY8íºa(ÅÈv^Iý_Vì(BT( ÌÈX[Ò$´ÿ¦£g	Ó¥½yÝµ@=J9=@´IéP S=}¤ûæÌ+ãóx#¿J\`÷,®e#wÍò¡¡ëvZ¾ó§¸©Ù\\òÁC!´­ýÉÞëåv­gðãy¼À QSVR|ÛÍsêùJþR=M«[àÈÙ>©´wéÁ[%×«z /1MöÄ¥ñ@ÁQ=@´@já"u31G=}8:\`Àwlvº@ÆkÒÝä=@Y­oßÄq«êo>¿=@Ã×8yOô=@=}s°CCµ³N¼WdçRï¶·wþLmAVÛCð%Ä·9_e&hãNjæIÅ¡4qeCdr/=J66ÞõÇLc¿÷Ñì=MGà=}?Zcb°MRÃ	kÛ¢âmÅðê­=@S42À=}wN1x>ä£o?5e?LMËA´8j¸KÜ¿WWËEËW§í¬j=@²WÌîeÓ!ßÚÊnïB:n¡Ê	Lï(®Òm¢¢=}jË¨È4ú«HªiË [âá7Þ£3·æóGcs¶þ¹6Äh&ªùáÃ=}àÊ[]\\÷|ÅìOã®e¦2=}UNÙýUª(Âä=@iAäY8x;é	3!úH=@_%bù8zç¦1-°Ä¨hÑGGAö]´°nE]@EæJ|uÆóÄá3\`±°¦\`¢X©nÇÈÐ±wPÔ=ML8:¾ODTK¥£¹lTM^4Þ¬J¼¾TÁå¨èoÿ_OüD¦ODÿT;À¨<=@5íawxí\\0çîeMàLëäïÒ,:r9NDEH-síK{ï;,>ªRç§}ÆõN÷WmæÎdÇ;ÿ°GÌÉêëþGìâ§fæî7or9öZõ3®mt©uÌÇû°3êpÛ¨·ÅiFøÚuZúÌÎº4·=@"j¥ÂÔú*n;¿ö*öÃ¥ãFÅ,LµÍ{Ñ}ày]Û[^i(Êõ°Qöðo÷?øei³Y@iZÈÔÎ(÷ÀÐÝuºr¥é¦Y	VçÿX´8Z³­Du«j®KYÊÆûÁÜ4ÃnJ?üx{ÒUïÄÛ;ã¹ íDuz!ë »i=M·Ì^ÌøÖS7XCµDU¡^Zðhª=}ì>ÇE5ýråhÎ·ò¡ï¥=@sÂú^þ¦ÓQZÂÎ²E¼F^Û=MUàÎðä0Zn)Ë¯b«¯Ã_7?af6ïI¤òigÊ Ó_ÊvqµùÔ÷QÁ<V7npÀÀæî¾IIª×µxW!älØÎÞ¤DÈãK[(@AºZÔØrhä­q¡ûþdîNÉèÒI=JkÑ¸NÛRê5?´i}»9Er»-ó±ÂsÊ9µäói ¡T;a¼¼ªß=JÍL;"¦¥Þ\`¿}b¥²¯$3êæÍ©¬³'¹)ÂrN6Ûðçrß|Ü~ØNjÜ?³]y=}zûÕ¦]úàu@ß}0b9lêæÓ¼ùò4î0Ù±rï+þãvK7ÀKÀvM±ëé(UY¯8´hÙºs-LígöâT·äsWb¥7ÖB!M5Ã.EòGqá"áEÓüböî>OmþT­æ¿Åå:^êö[ÔrcüÖe, »xÓ[fãþ+ñÙÁï¬è´AVíâÊ½sgÙzÎY=@Ab°'~á¬AòÖê¨4¶4m>ÌsÌ-·­,µ¢Å)aeÛ·©&4âÐT×­k&]\\gPXcc´$wY\`¤cúøYp¤Tð%º¸|ÁsÇünóÜRë¿P!Õ%!oGÿ9ÖDiØäbWËß3¸£oYXjwï7dx¼ÏZ=J!mXê^¿¡ógÅïªØ+$;>|<±Ë5}¯qtÍ@g³}à*%Í<¨àZ¡hHÆ~}ýÉB»n"X!cÎ*»§zXØE#åì¤$­Òçeó(å³A]±bªÌ,\`pÐÐ;ñ¸Êï¢?a;ø^k E÷°#ªzxI÷ û6eÈÊÊ0fg¤[d\`Nf9ÄC|mK§A²îäám<ëJö7¡p©p,ÈO3M§û#¼m=Mÿ:ýg×1HjäÄüä8vw³ÌÂÁí¸üºÏ1G^l5@uóR'Ûã½·G[_ø¿è\`j¹X¼duô®'óuz8o8*P8©UËí5CB½÷+õÆ²¢0Ó^±L·b^t2:;uëqE½ë"1uWh{hff¾¹åE¹Ã×Û¡{§=M=Mýq=}Vä{Ý£·2Âm/s_öõScBW½µij÷ \\f ¦ÆÀG \`EûQ¥Pvyà}i±Vý[Ùíl É8­döqÂø8úõHüLeÔma¥±Û;GÔ8·{GdÎ=Md~Ü½;AiËðiCàãÙN±Çö?±çZ48±Âj8qWþoOQÆ5Éþ²*ÇÝsf@Jö=J¢3HBÁçþ=Mô~¹ëIµ­¹»7\`øÝqaÈgùÐ¥¿ý¨¥"ôØÈgÜ;©Þ"7&¿=J$ðÝÍ(ÖË9|iáIDèÜ*Ù«·1ÆÞ]--JÉR¤úe]#Ñø;#¾éù¥Íè1±ùä(è·!7Éß&(·%±ùzØCäØ\`¦Ð73ù£@ö«Á¶B§<¹ÝÓ[©öô§¢6!ÑÄÆlbæR¹ÛÐ¹ñLù¬ê¸.òå£a^XQÙå>õlêEÚ:'¤-JêËCS¬í9©?xr¡ú²Æ\`ßmµKÉ=@I0[aYÛP-àèstµy'&XÁÀýâO=}Ö{ujè ¨bµ Û¬Q¢D¬é¡yskdìfe¶º¯ôÐ^¢F[Þ­Þ¢\\¢æ´ôOçí»øqÃ?HV{N=J\`Û¿óÛM©§CÔï|\\ìÖÒ¥k]æÝ!uøYÆwéìyÎSFðl·	ÜåµLVjZþi\`]¸=M6î×H^âß"=M9U|Ãã{|ï×W;KÏj+mäè=@ Nr5ôH·ýv+±ZX'¼à±ÆÂhNNnÃ¤êGdrqÏ®+JðA÷U[À;³[Æh4-;HI¬1M,p{ô¶åë¯éîëéá=}®F!8Ø(4¯éG´Ãß½|	%îÏumÖX¯åüÒÞ.}ÓU\`²ÍJ¿CÍË: z$ÿöA>d#>Ù§þVè=MÖB	|¼ÕË=JKÜ³Wn1:A	\`çmcíô}§ÖhñS8ÖÙ=MbØäÖÐk¯ì¨1]ÓX°Ü0ÛÕ½ÔìPÍª ô;\`0H}fWk£hØ"¡{{kNÚ¾TjCµÌÖmµ®ì°~Ø¾zKCÝîoßuW*5ìÏS"oÚ=J¹ý@Þ]×Önß-<¨ðT¢òa¶ÆimÆsÍÐK½hT7ý ,FÀû.®ÙºááÂ´8]Pcv¡úõú¬çX±X¦ÉíÂn3[v±0ÖÈm7ùK¯ÿu¿/Õ!%ÚD±Óe½Ú=}ïY5±íK:²í{]ºÒ®ùÆr³úm M#Ä¯Y@·:Zì°¶k´-o0Cc:ÙFS8>Éo8ÆöQò¦¢Á[É"Vmúã6QøÛKítjíÝ¥\`È]ìÌ¡6³V$Ø·¡¿VD1ù9ÁûQ#ÔôÍ&ÔÁ	\`ÖUÜ¿·ä³ùL¥È¢\`a¦@¢@Ïoç"];Â"vïÉ¼é¬$"#Ý4êÈ'=JC21¶Â×ÔXþ71ÆqI²fÄ8	ìÍ9ÈrB¡A¡61Î$RÃßûè_´.Ð²t%°öäá[gGûÃ\\7ÞcÔ}?IòæJ]/ræ/6æ»·|pHïÖ=@ÒôZéjî=MþHäáJù|µ²6cçæóYßaí#ùíúø¼C÷±úF\`2ÛÖôåú¦Õêv	Ø¡Í|ÃÿÞ{«7Ø¾Ål®~·ó¤LÌQæ:gÿü^¨nµÜ·Êºv¢ðà<N=@4Nr\\À[(xY]h2]A_øî@w­(úúÂ¤uÔhBåE¸iY!cØÖO°ó2©ù®I_õÅ²CnfâÖS#>È%Yêí.òß5ï¹÷§Âa¸¨mR^ùïº?ï°íÄCÖÐ ¼C¬Rÿsoæ_H#´ò¥?"Ô2¥þ³&xÒ½gôç)+=}r|ýu¥ÂßÎÏ]äY'\`KökLGg5ý?ZLn_ôþ!¤gÅûäþôò^ì®.î<½jÚkðUÃÉ¯^5ò¬áhïrËÝÿVI¡À{mêê½ÍöBæK­¼LÐ¡Þ1b:ôÈÔòi!7Ò§æ±³YWáÃoçâ(ëÄ§k¾´¹ün®=JúÐùS°¦âðoú µ´zçË~¸ÔéjVkR¤sÜ¶\\¢ã»CÝuËz~I2µ'Fz0Y4loGnÎÐ­55vãØã7¬Q	Ë­³w	¡±×'ÙEêÇj¢R»aâ{Ó{;- Æ'Nh=}gmyÖËö4ÔÇh+Ä¡,}S%Ï¾=@)ÜÁÏ°6jùæXìÈ_£§â©osÒPáK½£qó}JW·Rü­V¡2ÝH||º­ÍÍ0áÿÊÖch+=}(úëèNu÷§O*ä%m5õÊìäC*(qû!3!NíÒc?qU!Û±gçtaX*Ï­OÿP{ï%7D}¯¶ýÖLIå{áLAÛgF6.è½LÆîÞå=}ÆØ~§GÈ´Ü5}JÁà×k½G~\`¾ðñÊHÛiÛ02­¡¹ß"å8fñ{=J××Ä0y=Já®Ì¨|·ÀSíâ$ÄLökÀñ³æà+ú/G­=@'¬ëãXÅºyûRàÜo2=}F¤õ5úõ ÅhmT¨KxìO:ö¬ËØõ¡e+~Ê}Üì¬&Çá×Dxî}ÇÀåÍAKI[¿GTá±ÆÔ'ÙQ$'éªÓÃ]§÷½.°x¼0|vy­ù¾G,såH4ÛÈÌÔ%ù3Áù¾ð½EÁcoV:ûM[¬J~B}æN<«ÿYw©u{üsºÏtFW=Jnª\`¦{Sm>Kn<_¶ßî«MHVØ:XYzüÆ^ÛÂ1å¡ÜÆpV_ÅÊ=@=Mbè¥SIÁ¶Ü\\XÃ¨Ýhýd©,Ã}¯ãÒyþvÕÇÆCZï+Rà.p[µm$Â ì>h³PÈïßIS¤üß'Ëåë)¦&¥&+kî)ó+ó!À¿QÜ¥C®ÛeÄzjÀ´l6¢²ÁËíçô|¬&¥[ðnßÕRF\\,J¶C Ë²àÒYº34)4ê=@m:dÄj Y3÷«¶fÈºèeÝÂ¶ZKepvËJ6Ø)4·ßq*:vú°%JVíúÎá÷«pH¨R£±=@°åÌSZO4ÒÛKúö¦fð[E{"=J:ô­®ÂxÙ¢G^~Å¡¹7$äKÞ êIÑ_´N=@Ë{Ó] Tø>$¤Næo\`áÊ(æ}Ír]4>é*.ÅtKô¯pZ5Âxíg¢ÌÖ<cuDw÷¼¿ÂFLª@ìb.@NÂ"R÷¯oû¥îyî7I=@åP&óK¯ØP>×Sáûj®S¡IL¦¦WÀx@ðjòMã»h6ÄäC:ºb<¢³àS¢«r(à2g=}yEWçD7p^Iîzü¤=}t"»×MèûBøá\`å4G0¬,¾Rìkýå¹Åðh ÙI&)(î(ig 9¤¿ý~2Ô´Öt"¡Üù¬Y²ìÁùÔ?°>i:c2é $q>Xét¸3!hØó=}¢"hP|Î¦WÙRD{ÐùjÊ'Ü}Ô®Ò]JÐdixóY@ûGROSÆòÁÏ6HÀ{õ·\`,V³öÆÎ~ÄÜf?}1ßôª@úOK®?u\\9/£Vá.Lk§àgÛ®@¤ÿsyöl>Ê®ýºUÐ{_SP:=M©ÔA?ºqt5\`¬Ð.A«IV	´\\îlo,jÙ@ßVv z&	t¦âl>V3@µîÄW|gïGÞ"É®~Éy=@üÀÖ§ùÞhîeTï!cá¨BÖôèð¹jÖ¦)Y<'Øx*'©%áQ±ÑxÄ^¿7©Ê ÛlJ¥6})Ã7u}Ý.M¸ºôþ» -lÉ\\wâ5­³÷·Õlp*cv7ÿÎHÚä¦ÙP$s³Ò¡îóD/ËvYôØSLR´ô\\/©/68ÌÚ<Ê?öªª¬8²@ÉÞ5@«>o~ÔNQá*ü{ÆÏäp<2LH3Õê<Î7Gnq\\9fSBNe0¿Ü¶Ä(6õ5{èôÊ*éä+DÇTÃ~ßE@>DW¥|ÀÒ ?Ñ´Oc-nKP¦ð\`VrÒ=MÙ°wÕ_ï=Mçxþ}áæªº·ÁÃSNß\\<ÿ¥JÞûB©VB y:³øQ^tRzóÏ¬Ù	ìÇµ	"ÿ_;kä|&YÀäøFâÙ)Y)_ø¬â ¿Ã»ÇÇÂÒ%=MùÚ#Î­Ôt¡ ß|ÃühÔ¤¦h³.o\\f½³ÕáÓÔLÑ:¥yäþR¡²~=J2VÐ6^åfxÏþE=}ÎH·|Ä?ªÕÒàº±|&çáÐcKX±Wa¬l:µÛ$×¦ôð,Ê{ÈüËÚ»S)®þÐy×q©ðÒöWÁêFó1ZQÃXV=}ÁÍÎzÄ*Odûã&]Å¥Ê,2þ7~ü­÷º<Xrjd¥-XHKñ+õðÙîKÈdÍÞ9¡°?/ÒÀ£ÁÑgJÇ2§£··ÔñAWÍö#C\`B<oÓm+|éÑhðwj¹-·<ãV¦ÞÕM­0HÕ£­Mý½ÀHUH¶'M]Ú=@(ÄÏZÁ]×[9J°"+ë(.ûêÈVÄ*<Ý®¤ë<èBLTR£=@>hKtËNÓÚ^Á²ÂºÝÀoy¼Ë³/·,ös<!¿üî"döþÜÂOï%)ãsN³Ç"Ù\`[Ú³jkLJ±hbM*@{j~g=}ðÌ¿Wp{13*M¹} jâ.®<kHpÕY±Yí)øsp$N@j¨Ó>L»»,"¤÷ÂÉ,(/·dþìýks¿4¦z\\åJ7¼[ù¾PúVg¾ ÚÀeGÏs?ó???)|K=}ÀøÊßxòð£2?;Úî]4<ÃÛVÇoéJ.B4Ë¼Ë»YOOm3±¸u¬Ò²®^sºüÆÓ^J~o=Jq³PâæÃ Äì4å²A5[ÈåF1Á»déûÙ¨ÿu[²jÅD=}òH8¡¤LeÞ²>|O	SQ£kL=MæpÂg± áÊ­#S\\4¤êÝ´»qcÜ|Óª¶-PI|ì|àXöðW NöpèQ»Uñx)áFyý%®<¶\\6bl2gHà>ÍôZÄoÎp³J²ÎÓqO§p\`[õ:ÔÃÆmZi9´>Ò±»|ÆWén½¨X@tu°ÿµÞ3wwâïE$àï¿þ²¬¬ÊñW}ö{aÑv³¶%¢ö·BûcuíÐ¡ü » 3Ôh~íÎf·LÊ~ú\\ÙcñôCÊ"0ôÖëÊ]Hð+ãøs®»î´æ2Ð7î³°À\\Ì0±÷ïKVlìI±a·_|¢6â_þp#É¿U|¶ÉÅñì| ÙV:G.±«Ày1%=@ðÈÃÊàð#4ú|tayÓÌ+àójÎ;[NøYèÏ(õ#ãX"¼ºÄ6?M£MG~sò1.¬AíbÌ[ùþ^.Ì0¸ÛÇ3QcPæÞ1E~7Å2¹ÍJfÿÖÛc¥rÍöH¬^Z,Ó¾Ôý=@Á~Ï*[ÖfQÁ´Õ¸ÕÄ\\Î6I\`ü±ÕÚ;qîa^M606¿»M¥tÒíÜza_Þ§5g{õö{L2NG=@¼,*¹jºE²m$ÌdL_mtqâæ[µaëðëîOL f·¿òÄi_\\ÀöùT!µ¨B|ÏpÖ|A»àÀ2âÏ¼¼ôðOÆ¶> Ñ±­"qÙ=@eMA­gëqÉÒirKúÒr3ºÎÅk®mq)ý{¤kEùkJàòzòªÿÇ FjÒgT%¢ûY¨µD8*D Òl¨øÝÞ£ÜA÷Éßeæª°­ly v=@Á¾U)ÝØåÈÌÆIÈë aÉýË¿gÙmW%ÅÈ4¯Âi66B»ù\\L©Mf¡M¦XÆå;Èbì	6A®Aì#EÝi«§X¥XfÅÛØ¦ K¦@lkc·BKüLÆÐ¾PAÀms n¹£ÏÂ"8×$òËÑ<ËMNqoÖ!1À,Ñö¬æyÀPYW"U'©B=M¶ßÐÀt´éÉHÔNi¡¡¥qÝåüúàÌÍØèìÂ7ÿZKæî#VO3á%nGnìû+Ëà%ñOsÜëgõ±¥é"E(¸UL:º,¿ÒÍësS#	S>¦»wô;BÙÀÉÄÔ|úâªvËMqåèaÈÁÄ=J,~Cvi}t3x¤tgñ8'¦ªÆàJYäÈUu²1Ë×,Js1ÝäË1¶ÚW\`G¨ÚXuE\\Gú®ã:Ëìµ-ü*8Þ7UÃ,Ù1Ìª"ÏÂÎi×ñ+¦@Üs«3óZï°geV´ÿXC/¦9ó®½¾´ôRhnÓðön&Ì3y{VµUíHSô3íÐ¤¶Òõv«f3æêâ*@àSÛ}Netx®	³èÒXz%¯û©ê	(7´ARÂ_ó#ªË¡!æÌ¯vF5-Ð­tô<ÁmÏÂÜ·þ÷;Ý@K»-ëª-4F¥}5çö§Zj¥/»ø¶yÝeÚe×õ¶{æ¼ïe{^øJÔû¹\\ÿu'ú½èJbü¢/	<$ïuÈúY=@¦10ßF$.*W	Ì@¾LJ·W=Môf h}3ñUß73½7ªá7ÃýìZªøv4J÷§YêíÓ&Ýl9içÚË|¢,HGÇÇ±bè7Oæ!Ý§ÐÃ%AjC?Pä&èiûEù+É¶©TQ6s!/K?uÀÒ#Ï¨]i©M¥\`h@r»#m9ãJ-G@Û&ÈV,{¶V¶­¶.Ârür¬tâ1C^¬¤ñRþÏ2=M2²Å±G'{nµ=M¦¹nIPBªtÚMü¶xùAFÚâÆqk+\`ñ(Ü³òw×3ô?ëpcþl÷s´×|;»LFÆÀíÀ-18bÈ6=M5ÑïÊ÷âB±ïj[8µ+uãBêÑô£7ÆÛ>*/¼w±.Ô(l¢XVèÆiõïÚºeÁÂ©/ûS"<õ´¬°ú7f²/74$E×"0É­Bè{Ø_M°=@½æWÚq5¶k¡HL\\§Ã/à£Úí%5EÂvèã·Ê<óÎ4J@ZS!¿CD%Âûÿ[»oZä@qÛs6;"É<	­úÊnñÚÉá·½Å ÖäqÛ=M¨ý2·À»Üi)ìÐ/Ò[÷[-I±M5ô&Dÿ{$FÔ.ØûÜ5È¯p:«ê¹TåÂ½h Ð=@ÕhÏÅ¼©¥åÍxÖÓW=MÝíæ÷ÊRMj|Éiu=M7rtcäæ\`õK	%ÃrÑãÕR2Hà§4ëù?i+#ù!XozPW?Ùþüô±qImÜZ"e?aÒ¦ºíx ÜªóÇv¼h¥ÍÕ®~°¶=MJárn-³§ý£!Ò­ì®³:°¬ñÙÞsÀÉÞ¾=@t	M±Ësv&û=MsÛCUGýWò5Ë¸X«Â}vÍN@ñÞyañ9pÉ ²qçP´To0\`¤} c»Hø}NnmeòÈUN§Ãzh¦-l¶IÚüñ=@à9¾äæ¨Îr¥Sáö¾)úÐl8üB³½w¿gÃ÷u2ÔbD¢ÒrÆª©´îÉ¢øèêÛS¬¬aèr¡KÃ;U=JH¹@KÉ@tÙh#=@qºÑÎÉïe©Äq@×"ÀÉu\\®-ë½\\´¶("J=}Òi®ìHÙ(.É)Î­ P¢UâpÇ0	H£ËOïI( Û:hoÐ½ù=Mv	=M¶¨æ=MÜ,w´ù¤|3#SÖKÛÃ)Ê+T¹_kôÌÇSýH{î¦ÜèÆ¯¤¤3o§}	_Äwuîq 2O©H~¼W9Á¶tvE	/¡ZACCBaU£<]eS#$.§ÁØÁS¬ìéPÊÜò#ÉîÒkÑÕ«aÏ*Bþñ úvÈóñúT3x@¨Ò±¬¡®þö& ¤(·:u¾Êta)2õ!Ã*$¼ÃKÙæln%¬·÷st#®¤"¢2Ü7àMmô@ãÙTQâ^¯(ÜË l%ñéÓÉµCxù±heV4í^	²rÍÞ/!24ó­ Îé¥RH.XU*ñ>|º=MÕÏÏ{³¼P4\`ö#çôÁÚC_,Ð¼(]´Çí: JÉ÷oJ¨ÖªÌpì)¥_Â=J»¸{h;§òØíý¿¦Õ©ßCsg?ÕYàÿ\`°mF¿Xÿ0oPü£×n´¡¸²EuÀ´ïaÁ{«tÈK\`ü¯=}-aQ-ªçÀÿ	ï¢OÀ\\ÆYa{Õ¯1 »;á3²¼'q´dà uíïT3zaÐnûnUoÀnMüKJ?9|vÏæÉÛ{>ÏÚGMùFò< ý8Ïý ªt¿d0Ëã¸ýh$pc^ñs$fÙkmÓØ÷+B Ò*ÓèZ«wèú¡xä°KZ¶Ý÷+3À»OöÒ7îÓvÌ"ÐõkFºcÒiOô«ûøTÖ¿r×"õnÞWMNtè®¶\\(¤Çg±ÆG­ì º·M¹×Sn¾ð¦*Ô­TÑf\`mù17<ÏOMWö0]|kqìö´N²a½à\\Un×=MÀ»o+²g{ÑphUìÒG%F)$»ÌóFÝõzHßØ~©"Ð3,QðwH³Ð¨S¦¼ù|â±=@q=@I.+°)+{Ð=Mö¹uS»Ö!dÉn2³SW»½èèâÒ¶õl$)V5Þär>taË'*8C$ØcÜ¤ÂªÞÈ;Ì}³±0¢2[ÜgP'wãIYko*±+s\` 5u¢!ÞGák¢ËK7Úö,¦èþbòcÃó;x\\ç¥^Fû ØõG«ýÑuÊðÊJfd-iG:=}§W÷8ÝóuÅká9wv®M'¾Ýù"6g2nâ*rÔ¤=M}í¾v'qþÌùtÁ¦v úJ~ç@À",3[Î¶ýÌsxXÃÊ7Hð?+úkS0Ckë'ªÜ<aá²Ï.I;=JËí8&¼FÜ&¤Õ¦m'´þ_1ÍEà¿awÅ9Mâjþ9=}£Åô5K6SÃ=M¢ºÄIÁ¢äHQé®\\Ù×4jLTC^õmæ¿e$jÓb	 Ìtª½4¹ºKm3Vubp=}	ùÙ¯ü9hÇÑu'¨­æ¦çZßÌÏ.xEºg(_¤éÈ¹8÷¦àÛì|MéUÄOTÜsßÚxw´/[VÂ	í+üêºh Dý éò¾öhTÈLwOÁ°OCjc¥¯Èy\`ºÕ!]ðÖ«¿£úr3[íb8ºIfðýÌz3ÁkÚõ-I8Þ~¢b"ÝÊëò%(ó~0ôw	ELE.ÃÔ56Kzòsbñâ~²¼Cýnrì]yÓ¿8VÙg®=@RÙ³V> 9 eÊJ\\%ô:ãÏxþ<\`X#7_e¼ãkÎü¾Ë¶§o7ç«\\ _inAÏ'xðÝèHvâ\\¼ä-©³4÷ Ea^ºcoR­)ÖøråÌR&F5föÓÀÿKhSá+MóãM¶ {+ï*2p[«1M_77L3H®êªùøåuÂÑpJH±2ÄK=}Ñ	hoFáE¾âmõ!ÍË®ËòÇúTqKMvuî;»/s6Ï¡±ôn.NÛEÈxÀ\`ÒæDæöª:,ÖY=M1jDëély@Kçb~WËOÙäVÛ6U'jN·có¦.V±>©ÑÁ.IÅ¬½v/F§¿ÌÀæbÏ¦ý\\.Äqÿ2#ÁEÜ: 9\\êhU'+Bm%~ÎºYÀRZMõ 1Ü©\\¼[è0'ªÅú¿Î{Óê=}u¤ÀÀQBÕN¿à&T§wI¥æ=}CóêëkAQÝk¥?ò¸ð{IsÚTV%W÷²l_'õñþÒ,F~Fúnþ#e?\\1oÐN)âJñcC6NNòÂV;ã_^ÚòÆÌîì®._7ÙÀÆ3æPïù,7¯ïÀ:y=}a¾>NÓ!÷*¡-{÷ ¹Õòú§åúí¢*~ÛhªÅn^²pf"ÄqQ_HsìèøVWâ7írôçOÚÇk82ÌÞkÈWÜ\`a}Nª¶9G,±ùrÐèÈuGæU&xî;cÎ¥TM>ËÍÌmD£­÷±4&Ú¢ÄÊ¾º,*Ý¢bg'²þôºÑ&0GÒ×±VCi>Ð§>¯5<Rw!=Jv¢»\\æH¼ 1Àssÿ;fpç[½IeKéìÅÐ¢[ÆÔ^LÜúôÙ¢	´%!å@ÈóÚnçÚ#àù,Ê{Þ¨#ßÜ=}m.Áð~Ç/fì9úOjØìÜ\`2ØkslQöCwnéý¶­-­å«ËýnÚWá»»ë¦CøZ6ABJwkkÚy)·ÂÀIÌ;c£ã"^ãªúA1OàßúhyÆþ&¦no¦õgC$?Úy÷÷]ÍåÐ^ 3rá=@Zá"Ûd - '*dÖ	ôã=}ÝÛeZ$cVüµMè/tUJQÂ&=M²km/Å¦m£µñ"ÑôÇmky5~®VQHaËhB´Ñ7ë£ùLÍÝ^ãí!~B©ÖÒ´1ñìhÃ_m#6Qf'p¨rf6è^¹e=J7³ÀxXÁö;sKQB×«=@Mºf¨§>Ôí »nV¹õþîNý´2ÚUg=M-\\d¬À=MAârSPß<â¾¦]Ö"k8øgH uñ¿Fnº²ìgu#Ð.&Ú\\²rW#® 3C3=@Õ©{¯©pÆ{L:B+i¬_ ÕfÆw;ÆL+8!íC{ÇÍøytÿkÿ¢Æ;z<H±5[|ÁÒrX=Jùó ý7QÆAå^¼½¨ãÛ¹ÚÆ©mÐ'giõçx¨v{æ óo7zÍ:u¬¾#:Z¥çPkqxÝU±£L=@a:ëç1òT>Ïòg¤Î$'}uAW,ÃÞ¬H9X÷Þ¼pLªr«b¦\\"fG(2¾@0_4e¾ºÀ!µ01/q0?ÍKvRm,YÝ×ØÖÊ	éÀyä¼N]^h´N<ÃQµC¹þyE=JúÌG5Q¿´I\\IdÅm²Ú0¥´²v0{±%f3°Æ1»1*}#Ì<[ø±MQ{Gõî3öP­ ³LÇJmµ³=MsRH¾S<ÚiÆk.(a²´æR¥à #nðZ×¹rÅEgæ.ynÍCwKJLÀé7I3?FQÆv6ßFþîÀ¤/§¬.óBÑè!K]ÁÞù½|r¨ü! ú¬@¥5é=@½yiU6ü4«3~Ç4±-mm¶Éö¶ûð±¢2:íÑ»l÷U|¢Õ?÷J¢ÎsÒÓîüý²bx[ExgL­@2dÎôõÒëjbPëÑ<¨Aöi¦ì].Ý·Î\`1ËI1ÏkãÆ=}rj¿Ò,@6ýô^Ï¦TÅß¤Ñe|ÁjYnu:£k9ácLÜI»ÍÊè\\Di(£xßÝäÄ+»­-eüÆÏâ=@±;¯Ã$Uk@=@Áz¬%1zÙ°IVØ	ÖÆÐú'K]X{Å·°#Ñò+vÍèrÇåì­Dú'\\(ÞÐ}z(óF^ËHÎÕ9·}åR=@à;®~å7aË[Pé«¬F©õ[Hæý9=JÇä¬¼$áÇ«ÝÜÞïµÄ¿påÖQãH=MÏiMIçøÅâVúÈÿ¢Ðü8èTRî0Û×­âÙ¹OÁ3¯Êå5$Ì'=}ëâ>Ó^Ö»âÉtµÄ55àÚ©#²ûzbê®Ó3ögò¦ÎªûQHþAzc­ûE&=M9Q[§t¹ïãÜ¬µeÛÖí¹ÖÀw0Ç_¢õnRáá<H!@ÅSïmã¡ÚGÔ6Ô¨º¯¯¡ÌNÀ@BâF×ö&Sdý-=MÝjÖ#´ÙýS×mÀèÚÕù0¬@h=MÂøÙ\`¨##qiàMÉ=}sï#8û¢×¹Æ¾ß1dqÞé(6xùTMß§B°Ù7¢7·=JÍ=@À÷+|áa¶ý±ªðX\`É\\ý-Ëôh°[{.cô¦îY¿0ÐdE´1WM²ï$³æCLR;At^ÞÉwg	#\\ÄÑ §"]éîÞLb>Û½å#duZ}iØ¬áwvõÅËè¹XýÅ5æcÀ!ð6»ÕEñ×>ÀIs±jÿRE\\§?6<V©ëVêlA!KÃ¥ÄOM³:_¸óoêmÇÀ©§blÕ|#=JÆå>ÜoIóÀïîÚ}|Dl!nz,Ï÷z ¯å¤y=M7\\ãÚ§Lù=}$\`fæ¥M¬hÉ¯SÔQ»¬´¿½·©=}ûÙW%Íè³ZÛr\\ÞóÔ ÀÙö©/6¦Ò½½X(Zÿ¢íiF]#G¥µ>¦MéÝöKÒ|³}µÏ¹ä}0M ²EýY3¼ÐFÃ?U×=Jà(¬eããÍ_Åé¦±R&¼Ý²	Dl ¥)ÊmbÏ_fñü'&¡¦CÉ=M=M¯é­eã:ÀÖôùhé.©=} !â&Å	®dù\`ò¬\\0óÉöN£îÝaÏíkJ|Þ©óOÙs²RAÊfpÚ3õõÅ"ÒÌlÅçá(Os×ö#»W¾§tøè9t?Óùwöp3¡¶·É1=@aL/\\?\` ?msõêdyÞSQIyqé//â&Y3ËißÓ#Ç6È£{ÏÝ ZxA®ãòÅóH;:àYZÁ3¦jòöÉ¶OHKIcF­ÍçKßETÔëF7gÏIÆ4¡;ýøù}¤^f«1ó¶ïÔÆ©ÜfxþVã4ê\\YáHDèæ	r/±´­EbF­+±Dµk¤¿ZÃSàè<È¡.ªgúGÌÞHF¾XÝ>zÿO¼åcoºQ¯_í\`íÚSÏ=}èZ¹ív§3¢ºì°dHû¼/^û¹°qfzo×÷o¾sc¹)q>¹#Üº2®1=Jl3ìF.wÞå+í#:(tßhÚ§!$¢pwÔð!ìSõ©-ïþ·ÕãûÄ·cºù&±~!W*øò¥=J¼C<kZÉ¥W1ãq&¬6½÷YÒ<'¬üóÚÀ_NQ>õ¯ßÌÊï{¬iÖ0æ²ª'øèßýt«}ìÙ¼:ÿeä=}EX@¿*°{¦yxÈzÏ2\\à:Õ´v:ï¨7ï­,Ü?¤uÚÑÖH°ß¬érOhBoÐÊKµ¶§«©¿êu[(?zo¤®ßTÛÊÛ8µ'ØLARd[ EC%M å Lpuµ'=@¼´¤¡·gO òé}é#}a+çálDW Ý:¡71¾-Ýc åÛ	H±AÂVª0,Wl&±E2Ed)æt:¨Ýi¼¹¬¬ZÍxÖIO:µ²÷X·¸KÓØ±ÔfÔgñ:¥¢õKuºkVÊvjuÊ×@g3Ý úaûØ?a)ìÒ"¦áþ ZKùâ·C×#ãìÅÏ=}?éÖ¾\\ òÌ0×yrX+,È6=}î*ÀVê¤¹ìhªJ%é@ÿþ,Ä·| ¨hM68bå±çÞp±]®ìÖ/»o=MpÆê¤n,xNI«=}>Ærh4Q<¬éhª²=}Dí3·: Â$í¤{#*&\\ è}ö%éçíÌräèCüZzjn¬BZ@¯X1øc/[-TjDxÐuÆýÄøc'x­'%!¥i	ç¸ïv¡fÑþ³SÞ=@µRÞÅ­ÒUæ­5¶Hkß)Äµ­\\ÖIA	nÝì®Ç²å2QÂl¹¿.aÚ{|-oÍfvú.ºr/jê\\}ªY[Çì+by=MÞFÊ!2_üZ,ûY|+ù.L¶R£Fûãð7wi¨><H(.¾þ¶>ÛÊÈÓ#»¿Ïg¡µó"9ÛLó Ð/Ìeîþ%ª\`ª6n¡°Öê\\<JQ&Ã²§rô<£¨3ÊöÂÚ°¬V<ÌÌ%>-C!QsËd²ê8Ì\\Â*¿--ß?²¬2R|:îÅ=@L½ùjÊCÍëÛs=}5V2oË8qOã/¬ ±	d\\@Gó?HÅVÞ;)ayà½GÖ.8â_ôàRv¯k5÷»EpNÚ<;è_S;l½Ë\`Ûsî©<Æm[lPléºï»µ¢rho"[bbJñ:\\W?UêR[ïýÐÌÐZð¡m.Ë¼8fF6ÌL¶âó[ý1?_ËpêåÝp0BÓëlÊ29A¬½xèX®52A_=Jw×0½X¯íKÔËËÌtºgÍâuHÒê5=@ö¸_GHé2ûNcµ-çº«jkóÃmÙõ¸%y xî+¡O¤2ÄÖQ>êf Í#Q?lòÃ0û´ÁvBÍ0_5V\`$6,Ùéë=@½(LE®P +D¼K¯R»¾ðt4Ìmá".Söº¥²,ÖCÓ4RõÿÆ^Z%ûL=J¹AÚÓºÒ(D¯TK¡[YÜBèÑYÝbïhJE§(ÛÞøX·{Ö;yãªÍ»bîtO^Çu½ðÂï¿ÐJ|Ê9v¢<Wd1Neúæ*þã)&GÒpË6qúáùj·70Íw\\BßsnÎ:Y@Øm3áWì«ªXl´4Wé:Ùv²Ðÿ'´;Àèñ7tDãa=MñW*VJ®xðË^ÑF8£Äbm}í=}1¥÷4ÞÈö×^cfy¨£^Ô¥ÚNNäg¨<óÄJªÍ(MÎ:Ó%»3jÊ·JÛî+oRî-êúÌÊ	Ìê¨ºó³ê}$wäî½E¾!ÒâKÊbD&Åõ½?eRü§{=JyAiÎ?È°RqÀ>õ­FU5Ámî¶NI¯nÚ¼ö<]3Lô0dqD¶ë_rTò0âS&w3<ÿQäèÊ÷Ñx2f¹ëµâpÐküzËõ9<Cl3­ò»_&-òOíÌ1.^4S³ïSºe;}Óp§°7Z­E4¹@l>¨Þ2TKzúMa2º&3YSS:kGÜÚ9évl­mb#AË÷G¬¯. ¡ù¶j³;m8=J;1buÛ6ÞN/Ì²NT,8OKO!BzdìË?oB=JaÈ=J=J÷L¬x±Ë-Óú"B«S­Z>¿0ôÀÊS ;£ñªdÁ©'ñ-a;ÏñBvÍZr ÉBdv¼W%T¹ð?]ìÆz9Ç[²]ôo&Ã+7|bj«~>ï«hýVYX{Êh»1tU´²\\cë&â0:Ã@6ÉRê¥ÄR^¥¤Aý.N¥&m²¹jxâ* «¬«hD¡	97sÑñÿiüÑé­\`Á®»Ú"ýÞS<á©Ã% Ën9Ñ	$%]%'ãQ 3çhíØh }WïÂhcbùn$ÿâMÓ=MÙLtrâ[-fK( Ìi:¬°_,Ï¯XAl¢&5p^G2q3cáïO¸Rä6°jÀ£@ã1=}9ò¡GîM-D5k}×2I~Ðz°¿~!_!k-èkVìÏº7£>ôo.ÔìßÈ]V;W®µBÆGÆò=MK xujæ¢¬@¼ý^0pKÎ5^mz4r¯L|Jl[IP{q<SìÌ0N^Í»ù2r0C÷Z1¥szQQ8DEÞ÷'îÛý7ËÊR¼Ðã©º»D±~.ÊxþsQ4{Õ=JÌÚ¨ÊÏt±1á¦Ú_üïNÃB]6¹»JÜ/·MÄËÈ=@^1'Ä­Z]:-Ê¯Ä~§r_tÝÂlUîG´ËYàV>õQÆÚ«ú¬Ñb|®Ksb4ãÿî;gjõUãúLïdcñ²QMýÎék#{F»µbËkËl1¬º=MÚe½qÇåúAërï:ì.0M/sc»cÂõ^¬R÷h3Þ\`,uD£*#Ñ7/¯õ-^ªÐo},K_.¢=},¬:µºÕÐì±4µfµå²yÕ¥Ò;A«ÉîÌ­°¢k#L¨MÇÂ¯õu¢Ú=}s,[©ºû?8Ç#ËH?JÈìæ­ê?JòO©Î7t]=M6¦¬è\`[ÿ©j<ß5Þå;N'é ªÄ×N31®.ä\`^ÃonêT>,ïKëªçD¿ÂÚ´µÃòÈ+;/¿¨Ã¯	;î£_&7Âoî¥D×Z7Ï~ÆßÝ X¥æUaú¿ªÜf£}+Æ´Ïµª¦>/yÍ²åë£)|2ÃJN·©]õ%Ïo+¿,ï}3Ûî*³ë®f²2[ÊGÓ¨z.9=JDy]ZÏºÆû	xLÅ²=My&ç*È°è3>À;¬>×iÖÞð4@.b¢±¯C'yÉw³@qó/è·ò# ²¸D{·Î£½¬á:wq9r!NÅò^ÄE=M÷÷=}¸Zoîc±ÃÎàxÉ uÊK¡.n÷@9µª^¹Ìn·b\`Õà­¾Öïê?%t1|¨õ#¯"_é»º7d-1·à±Ìã úZ»O÷ÆUÂ}2éû8ºë=}HBrÎ;±(å|Ldnf-[ÿÈ;îÓ;"oñ¥ÔôhåT;îwÙ4ZøØ4h(µâBî°áb:TeÖû:E³¨w¶%¾ù3VjMÓefüÆêó¤Ú%6ÌùrÝÀ¶O¨±ßìud£ÌÉXÚÏ-³²vËwS¦±µÔ.¤ºbZ[q8	®å^|5ÜkåsøFÅäM::ÆÎ¬ãËq°©-o°ýØçð6ÿxÒ5=}±bß*OYvöÍz¿ÎìGÉK'L	¹SêTvóO[-"á[Ï²ÂãñÆxScøfî=JûEãf0.î=J*8$=JBcÜÑ±Me|ÑÑàmOC¿åÌ©rÂ÷_âàV5ÌÎ¬ç§Â&H+k/]·b²=MNKÂ¼s9´0a^Ú¡É~sf¶eMJØpÎP¥ÆL¹1ÄÅ­ÇL=@åFèGpm@æR÷Ñðêý¨pþ%î35òc&zàÖ¤N"º1Hê¼zé6òXwmjLaÀ±%¯¸*ûDé¸¢¾j0¨48b1î+	2Ýãdc1i¸U uk¨%	î+¹QÕBkV)=}=MqòÏ®9ç0,,YÔ«è©þ*6)¥7ÐBuRCS}º7³¾öv#Tý÷@¦T¢Ëÿâ×ón¹Ó:òjqT:Z|ò³Â­³æÙÒî5:c¨ÄVxdjbAþyÌ©ì8TU*Ôº¹ßð!Í=M´âÏÅ¢/ýZBV5ë^©ÙÄ/x,0¸Rø¨ödÆ|Ì,ñ«Ýj*û,2J4pæÍ#k®+\`í°0Ñ_òµÒÎÊ\`Z²t-·Ék¬?lö:]=}mÂ;ÒlvÙ²ø­ÛN7èß»1Á=}¾¿é¨.OµàXMâ*0WRÕÀAoR@Oúnd%ëìÝ£Ø=JÖ\`@/¡ÜÕ±Á«UxÆþÓpF%Ú[«\`²ÚÏdEn=@/_R8i0v0Í tÜ­4×£G·|«{<BâU­ë_íKÊ»2 xëÚÞ$±ºõFÇx^=MQ¬Ö5wëFÏªB6:t{R$]\`SöÊm|>ñß?x*úÅ|^ëé~s6uÔ<Æi%q¿îÖjºÇr¿(Ò<¯ÍÓCã·?·'Iß|»)á÷Óï&iÔëä×mv Á@O_Fîj­óÓ£ÏKXz(EJ5äUÈ(ÍÍBWVãJÄéÎ´Ï{ó{«JÅ@^¬i÷ðvC;ZÄÀdD-fñôSL¢Y;¬cuÞ¸¸JYý.*z=}Ådp"¾?VÏ3ØÁêmñÚÚ-¨ã¹ÖØuÀÅÂÎ­û¾ ~ëîxâXú	kxòPÜÕNoûP?~F³¶Þ=JÌ>­	À*\`Vä+mÒ jª5KÎÏ¢Jþy¬ÈS°[SUûAÃåDo:5ùÓ=}0Ûy*[¯\\:c2õZjj|/IõHÓwµ»¶kEMZd¨Zs¦KJ¾.$Ár­öMF?®=}l²àïD«íÈm·o:tUwJÀ8(=J²+6Fè:Àki;ºJe=@h2}ú%j-´¯}¼;ú? $³±þ³¶kf;Á=@ñO#< &3Ô:-XXkÇ'$S¶2r-÷ÊÛèZÚ$unæ3Áýìº4î³à+z+Î1utÿ\`DA¾&<4[2à0Ö¬@ Bdo:Ýî;Û\\³åÇ=}út!Ö¥5?NßRåºÕyÄÒ¬ùpÜyz¨ô_ÙóîUþÆQ5û.:ôî2rq¸ÍjFì­?Ú©[2}.U¬é:Xúÿq<²²6jöDú¾}D¾Ñ*ç=}¢=M'øEÂðôH*}®]-´È­ú_ÜjÑ}=}d5Ëc4dÆý^&>?m77'#®¡Â§g-'@c®ë@BìØ×_tåC@æ5.qÀÆpû«·@¤×{:/·LÞ¬ïÃÚ$ÌsPHK¤¸bAÎsw ÖìHkÞÓM5¶NXWÃ»»%b÷eeý³UxÈÜU:<V\\îîÏíÚ·èQC¬¯¥Èõ3½2Ï/dûÎÌPþSW¯ú{Äqv_.ã\`1·LpDï*Ú1%ô/ÄÔ«:×4x>R:(hrjpì;Ì+« ¤GF°´ÁK}ªÔ>kë.!D¸{R2>r0=JÊH;Ñ=}QÊ8Óè³btÌ:~ íÑ,{ðÚ+lýòü¹0Ô¹­ï­NäóÐ§¯ÅD^HÇmKMñf½³+ã<{.Ý³,®ÆËÿ.PÑâÁ©µÖPJíb»7'=}ó(ò±úo¾-[dAz"y#Þ¦b=MY:ÉKôIrÌiÒ%yFßí¹imfkô«CL£íiûÜkm,º©øp<8ê^¬CùR8cËiK)Æ÷uõ=@­(êÆÉÜÿÜËiO(cEL^|¸8QÉÝýÜk{<öÜ©øÀõ=@¬(ê¢ÉÜ?úÜ_Ëi;)Æ7X^Rq-$-Ó©ô@6lAcúÉD#MÜ½¸aâ%a5åkÐdìÓ«îMZes5éDawq7&¹ÒKði°Bì)¶B2)]²K&ùK°iÍ¯Bì)¶@_(eÞê	Êoî©±@¿)eÞR)Iûl*5¾5.&	/@ë}@gº9ºóµE¬­-=}Fû£ncXdYFÒ±.o+2¬jºb~fù³$M­·À+»W)K­ÇÀëI]bC([­ÍÀëI]bC¦([­µÀK)iÊºø.<)¼k¹P2o¤ëJ¸([ª:Ä-R)Oå@S{E\`»ËiÊ2.²)Âëxõz#I]ºH,è©ö=JÒú,(å6x°<)ÂëoõzI]í@YZ×7Â(ní©9ý=J;²*Pi8}îòLV&:ÑpQOÞÚ0ò.ìrn0/øÐp3Y4hêðæóRe<Ã5\\u:Jù®)¢ç:;<SJÊ>2Ö.Dy&KøÉ2HVl=M«\\ý^|ò7bS¼L{þpál¶®z ûØÝÃ^vþp8¶úá²Z8eõQws"Q;d}\`*F4û¤¥¬ud×Jf¥ø_XëicpUñ§;íQ¥¸Ù;nôØ1Ø-Z2XýáZ¿löA{õ²®ÕùALï±DrÜ'6®D.9?ÕÒë«p}Qoßcí»¯ ÿºïE²?;²¢-{ [ûL¯ú÷JËÔ6ÿ§{3´ðkm;#U@ÆØi2³f2LKôü=}ü²ArêUzW;':,x2¾ÊMïÄÇ®b­Ðÿ×Æ#çÙK*2ûæbî?KÏ(9#îOoÉ¹=}Û»T±ÕKRéËwï{Û±Ð=@dM!£kB´3Ñ+*//ÛRêÚâË1¸!ï×=J¦d"Ú±êâ1î6tÀñi¨(Y'Q#ª58îÜßnêÙÉÝ8Ã´Ç/°û¯I1>ôlØ§ªp:À3>m~=JB=JÊh,½N\`&lÚêÏ>h2ú^FÖw'Ë=}ÁøY¯ÐØìfsTebXæ»Ð;ï]KÑ+ÓK{lSø¬wrY=M«Gö=})­õ69¬ª"c²ñvx<B½fEÄ);¯½lilTj>Vu{]b8¬Þ0¸ :dDüO$OþèÄ=@5[%cÊn;=Jy.íÐI©L®Z·3¬ÁÃ_/'´¿ë41¢½[KDc!ËÂ^©²ØZÞ%=@y	1,¯>*0¸SØ;0%ÿMæ&ª4ÊMÉâO.Þ«%Jnä;õùl1õ|HhZ®/å xAÒ3ßBÎìÙÌiJ¬ 4¢Àý«þD²ðò¹²1kä¿@sàÆoÀ=}è=JCòOë²SJë.ºp=JL½§¶ E+^á«=JYã¼5të¸ ÿú[;ôwõfêÃÐ0ìéLÀ.2ËÔVrjêI»¨5jF9³=}ã=}ë*ê1ÈPÜF>»o~BÞÑÖÐ	ge2¦Òxü×[s©:7e½uwúrtE=JÞ}m«BÞJíÖåMj	 m·XBÃ'9xå Bü5aÅºþM±í¸×+5fTübp¶ÕZC<æ ,·¬í¸¥~Uâ¤=JÚ½aKG,,òzrE?òK.+} aàWw^jH®î*w7Æ]QàD-¯Ù=J2:&2cNt!ò ,Î³6SrZ#ÈÜö?ÚYäò7º@Kµ}m$3¡Ë]®O-¼ê0ìµ¶¹È;´L¾R:ÿÇ6a2uóÁ,sütèrØ§Èæ­=J%JÀW¦ÉpA¾Æp.ó<&KKK©²äbN¹èr1}Y[YÛ ·KVHcó¨¼'=M ´ñÈiH¥i %B 9ÛCø¤©E¡Dby8.×Iâø¸áJßXjìi=@J3Uïüo;1¹0Å,·»µ=Jæct×i3s)mfsQõMÚ°^,ÆW}ê*¬¼:*5Ø.¸nþr*DÚÁÛÕócB0QNjÃüÿÉQ.^¡¬Ïö[dBë6:ïIVVÛû/1z-µb\\#ã9¬ãÈìëÀñ»Eèg?r[Æ1=JµÖö¿¹Æu¬Û*Òê*/èæ*=}"ªK=}èòCx´¢èKî&Í*tL:£êÊ²sJÍCZ×óeËÊZ$Áa¥NK·Fê=}SódU}Îâj;÷@=JL.Äiê¯R®lï#Úlõ´ª;§ú.Ù>?u8RÆd;x±bÍcÑx}øU«N®ÿªq«0f=M(-Ðk=JX¤@¶¤©­ßÏ³&«$Üb¼Y·å8kG×Æcu.}óvAÆS¸7sA/ÀEïï¥:|¸ºÑ,þÞWú|o N¯ç«öÐ2o¦oÛº[úkòê½ûÀxàG0ýgY]2«+%	2ûâFÏ²cÇ8ü¸Y:úÔþÀÖÖnVàBÜFtÂLÀ¼*ñÃ"ÙªJâ¯Êã¹}ÈlJke8,§:Hb2	(2×vx"2e'ÏàªÐUJú{¹vM6Õ_Ö1aVj!§«nÔ´Ò¡¼nHUu²¢JzËÏ7º¤ê¾¦",ÿAdÐë2.8©äí^÷»1ß1vÄj*RÞäýÖ1Äì¸«[öÙ¡K$rù¸@Oì¼W«H	,7Àuõ§Ôl­2¿å2d}ú¯´>k82_0¬Z¬ó3ÖÐG[$ÿ­?D=}Ò}klÊ1;*HPµ²MuõÞ\\ÿÚOÝ½~AÐ]Æº9½¨=}mÑ·ðqÖ¹LR¿Isq@\`UX§ömTIiý'¸M82åã®!s=Myùí=MbZç)ç{¸)Í{~\\rjªOÆó~Êp3¶=Mî=}¹]?fM3´]zµ=}nëÆ-¶QÂK½»:3Ü­ÍJâÚøûKZî<ßÌ3VJ^W7.­âÓÉÂ=}´¤¶Ëó¸Ür@ùÄ>8òª¢CFÞò(@"Æavæ3g'Æ¡óÜzéÆÁ¯¬Zæ:\`@òPn [0­G,02KÞE80°2£Î¯7K[oÓ@ºsé2=M9gäòÄHÇ²-Îîi_Ai8l1Yý¯=}+4êsÒ¨¦ÎÌÚn¯4rÑqJwË¥5/@r5¹ÇÄØÒsë >L¿&´ý¸p\`Cú>²÷ç¡ uî¬:A]òmyTÅÍ5øÒ:(!ä­zÂ#0#eÓG¬ÐË:{²jp<s¦cºçW¯Ôì¦º=@@Ãè²ÊÅJ0S5;$«0g;	\`gú¤Ú7ãJ«&¼¬x9àÏ0\\oìúv9àMQ\\NbîÏ'¥Wd78dp¾-0¤xSºÆ|=JÉjÏjQyX¯bz´mÚS¡S~Ø|Þltû4÷´½4"ãuûõSoU^Ñ>×z{42/DüLïRµ¥Ë«Ò»^8ÐH¸óÄzÉø¿Úa¸;«_ù(5Íå.Qüt=}Ôû®Ëô9øX÷ExÐ^SÊ©´fnbobþýwºz¾¯ònÒKÂ¸ªÛRöQ:Y ¤ÚQ¼ÖEL¤Úeü@t³âÂHkç®pHäw9 ÿLB­$ü,þÌFE4kÅ´e¾DÓÁ«|Yï¿\\¡S8S8ëãuëÄå>×úÆ|ÞlÁ.éëRïSBIëÏ¢m×ZS£îxShü·tË;ì@èÊè6V­VobnñªmÑ/aÒGÄ_(A/¤íbÌpa§>d)å{þüîAïÛêÁ:Ô=@Ô:{[¶	"&ç4{=M¹Tn·êÄ±ÔÊª]~/6¾(q~ÜØÆå²ÑK=Jâ[)Ê¸¹C­5Â{´=J´ ÊeexwXF[ÚÄá_ûÔ¬[1zÍÿ)Óyö4±ô Ë?¾á³ÚàÞåºL2c§ÿ!V´0UåÝmW}ûLdÖÚÞÝGV,¥Ü³®@Oæ5ì:¨éûáØq©b×Ë«>×Ë½XQ<57VátHg{¹Þun£-ÛStÅV=}Õ=}åNÓ2]b{-73§ëpöLb}¤êG;Ã¯R2×6÷·foB,4ÈJÆ÷$3ø½zj?(^ïÛj.v@ðPLVÙ?v:Þó©â6&1>Æ\\Ì@§/óká¯Íîïòc¥¬ªJuß«­-J®Àa[^ÜnZ=MvyqF¶¿@\\MGVcÀ¬Â4û¬;ÖGsí'qX·8K×VR=@±2ee÷ö:ê¯lÍkýmÕ&Jm³¸(¡Ë¶ïPPq;';ªâÛhî$x?$ÞÔ%J(èÐ?Ó÷Hª»¸;ZÑJ}-Æs9HU43k×45R6ÜHþv	ÞïPYVh¯è*H{RQäÃD;8é²Ê"LI.ì\`xâ:ôè,Ñ¯Ïú¹Âlz&a¡Jù:\\xÏZ+åÒªË{qÝV²$îÞ;ëö¶sé*m:>²ÚSéêj¢4HK#~:P¹\`(LÎ^ÑCV[J£¾®\`ëÂ@;çúlam}÷/[Ümû©·>»udÛ'}aÁ[Ó0ýòK×Ø(·Y·GÀö´ÞJ3î)<ÑKénÌ@².«ÂÝ7|ÿ,³6cË¯P)ËYvPèiÀ3ÒsKÚF0UÇr¶-wkxµRLPnô=@Ã¤ßä¹Ï)Ý_û4Ãø.²pTn®	¢á@Ö«Ä¼¨w9·æë§®ZRQí1JÎ,2Øá@o°@¼ÑYÜ:ñvâ&<´µDäjM|BhûÔkÔh¬¦=@ÀnÎmp2LXó9Õ.¼±Ê'¡öÁ0¨Ì¬Rjv NZ®%Vn:Jrjr4ìÏAÓÙÍFiü®¬²ÊØÛ}²¨ndê«n}þ®v¾L@}üV±ÍI\`ÓZìqöö¦R#[û=@f´Û»6Ü;äðW1Usª4?ú[ÊHHF.´a5}Q®±Ui«¬² þPÖS¯yGÞÑo;0O¬w7ÒM92G¨ñP°(®Sk6,µ·ÅtA%c°»*´¨âOÀ9ø±¢ªâ4Ð¡Rq¨û46C?·¥Bô=JÍßQl¥å\\øÿÈôÈ&¹Ê=@|ØßQLÑ?#°M>Ä°²U»bç)§^SÐÞê4­P1=}uwïs±V)ú\\¦ËýSIéF¬ýÁyÚ)=J,­EëûâB£°·ÀùUâê=JJ$>¶­IZgbæ[-#1$ù:­\\ó	6þ@<BZm8iû2ºRÈ´aì9ÚÂ}M¾óSÁI7³^m14TvEªl±Þ<Òmë=}OQSÊ=M;fvÐrÊmoZU;°2Q[AËV=@>âj®¯*8Þ®;Û9grv>éYÃ¦ý:X}mé=J¿pêIþX¬DúùÊh{²Ejtò¢&6xæ¬04ÄXâJSL¯=JlòÂA¶åZmä±ÚC´ïÐ1AA¸lÇô-Ï=}6J&ËÂËêêª´f³&¿RGhîm«4:P« ?Ìqpn/1z#:¯½[Io,µ{êf;¤²ÑN©;á³ì{²Ï2{æ²Ôï"2³¬!y/?À¾Øé³Á½5H·,H£=}Q\\MãZÏEýrV;0°z·Ð6,$:=}P7UZ@>µç\`=Jn¯}vH[;BX=@^}ÚI\`-P>Qî~4¿¬mîö .1M=J=J¬Äý2WÀàÂjDDPÐ-µ+î.Òâòagb©xÌ5Ûï_Ké¢¶SwQ:¦0FEn8Ò{¨«G²QÞÖºa1þÐw*ò´f3¬­àbn¬Ôh7L/nñº}*¦ó_/ø^/lLBPÆùÜQZ×ØH-X·üNºñ{¶S»^î.Èº4:*íÍÞje9ÌR°¶°®±àjl4|Ùû- $æûPUÄ´m2ã°P/nÀLâôµ X<o>Ð,ºÂ¡^µ=J*¤øD¸3,3¾5NyÖâoLIÚ{op=JÂ¸Ê~õÒÍAÐEcWÕw³û®x?£uK»ûÀÐü½Z7¼ôÎ*eÝÁmð/òèx.!ó·Î²B-s5,sÛ¢dæ¿ìK"q6u±ÅýâR¶ÿ}]ûm>U>{:YÑ5/@ðÅÒÍ:îaZRGZ?,5pæjÃzIæüj=M~qLê]Þ5jm43:ªõüÌd¶$ËÏòERÄ*/Ë8ªb¿phëèj>±ÂWòl+Ø}¯è¯ÞgûÜm*ÖWe(«klK¥/ûkn¬Yáñ4J÷F7|ÿ=}=@\`ÎGnº·í5Ga­sXh.y·L4§OâOKÐh;!Ù¾<¶ðÆ¢D©£ Z<Ë=MÊaBR"k5ÎÝ&.cÇ=}¬Ã*d åÙKÓØà/ñtÇhSúÁ½S_1Ù=}q$JJí×½J»2ÆÔ'=}f4 ü8F>,ëÞ5÷u m£P{{ÚøP9û²(9W^[4ì×6-p47ÃvnTÒn¥WcGGò«²Ê³EvrÑMÅ4M{Ú'¼zîÖÑýb·»î1±=Jòyù²Ö?yßÍ¤^þ¼leì³ÿTW|E9L²EL¾ÝKÁj¬DùÈ;ù_M¸'¢Øe]êØ¼çÞ¬nÔ×Ç×®§L«:.6ÚÿþÆsLxt§B4ë8@]ãR@ü1÷©¶7@vweX%NnKLîãÂZÿ+qd"µëÃÆ=@æpmoµ¦­ËYÌ {b3Çs/¸Ê²<0º/:ºð4²ü«âÁF=}²¿@°z¡ÑuªS=@¤wµ¼×ÞA«'F·¦òg¸ñÆ!:OJ%g\\%y¿}:×âÌN+³\`£nxùóÊ¿t®L¡ZN4OE7ücÊ=@K¨¯äf)Ù²öúrìjýANÖæîÚQÞ©i+çjÔxº»ÆëAÌM'çûLÌÁgLl-+=@ëö8³Ì%¬)¼OjYá[5¦¼=J²é_¬=@Äyõ]pprÎ®¯÷Z´ª,LÍ²¦=J*¸âUB¬º¹j×uÂFK?ÎA2bP#Õ°­S3ziléê~É:ú{b§>$/Ztð¯c«n©_1S\\xU@Lå:íZGûV¬81Þx·+Ç.'11Nè·ëPnòpb^Ý@ã8ÒÍçº¿Í=Jõ5	>D}HºÊ³¦i2D¡îÔoDB°¯fÎ²PcÿånWððÙ/cÊgµÐc	AØhûÐþ+QL^¢ü:|G_áAiêÖªZ4Þ³ïÖYFÌ-8ëÊ"tnCDqMÈb2Kbüp­^Æ²íÊnÜ}@9$X¥Ç&IGÍ7íÈdÊYð?S'Ín+*¹w\`k¢;¥\\"{¼pÇå^´sùs±÷p¾ÔÓ)çÇÚöü©ÂÌß9{Â>Lü¿µõHè*ö,ëFÇÙëp-¶\`4=@T³zs­òã·MÍµ{¼7ìBÓ_²¬T³Uü<ñ®/å0$7[¿®d 4) 4lÇU¥#)_¥£¶ÉÇ2Ê)SÙPÇP?nn¯+8ïÝ} I­ùn÷zxZÄ=MJAàU5/Z.xO1º\`=JJRê³rl+¦uCº¬¥o5Ô*o=}¯û,¼©=}j@¦Ê:=@8P¬=JQËúFÀ?³±®'wLNÛÂWÿ¹ýåqe3BÁ40PÀRÔrÒ^Zþj·ÉOÞõ;Ú®¬@jWDÜÙÌEÃÞì20xÞÅÚb÷«=}B9=@ë±£,ibQAE¾ÏºÆ=J9ÎXËXn­ó¼©gÙ(d/²àÝj{¯it×.²VX$ý¼;y ã/\`k¸m\`â¤ãhlGòøLUKåYä5?T[åx~¬µ,faOJÀÇOÉÈSå.î¡ÛÝJÔâ¼¬²*úÝý>ÂïÁ¹ /[Q§ëAº$		/ªdüVí_=JK3»h«º®6¯fVÝXÎ¥uFKRÜUwÚËÛ½º"1à¹ÞQ/w¯ïPÚj|ÄQMd¥»YdLÉ¹P)?t@dzîí4ÁëN3üþÊ_Ä4\`\\_KäÜ³A-ûý1où²B±\\UîA@ÿýQR4ËÚåþL?0E3À½]LªøË¥îBº0?Ï£¥ø 3¨@3ÂY£.1tyÛ×ÞýþíÞXsÀ½£=Jï}æe«ÞÊp5)Ü9[ðª÷÷ñ;3ìz):MÎ&N.6ë0µGoý¦l§ÏR?½¼$]¾3AÁüäFtyoÁì¯òÐfûûì;¬%ÒSânbcf¡»a>áÎfH7hSStOÎ=}£òñ°àÐz­vûÜ÷³5ù¨¿úb;©·8,­¥U³Äïk2û*r´üÌe=JÎ=MÐüÓ¾fW¸@.ÁMpMÏ'b¯Rþ<È-¸³ÚÂÂï1ÀnÁ²²[óEk*èÙÑFPRÆ'3dû=@¾48ÞWW	®£­3\\\\j>ß~fKK¿Oæn/kÉt¸AäjM¬Ô±\`ªn*ÊªoL{@iX°Hãxµþvõ[ðÇ&³¨h=M®¦6%«Å¢É2Ìä©ÅX{¨)fBkÊø=JE÷¬ÙëÔ+÷fG<û×´BIæ^ÀòÓ«mBK´ÅWÕï§KU\`^99}ïMÜÕ´Ï}JDÀrÜJ¼4Dg¡õO TäèÑéÏã¾ò¨X&m&¢´Gøw"qm&WÛøk¤¬r]HtOkøs§H8 u3¿Ð#PêP£ñÆñÀ­ñIw§Bis§BXX£Ú|²ÌöûCÃæJºE÷3=@RÑ?$zÄ:.lF0¢ùª9CDÖ>¶±ª.4:lµ	}tÎyD Ç9«×ËØã$ªØÎPíÐÌ<²Úo70w0XÇËB3êR<Sµ³c2D.æ6K, ]á®y7Ï½2ÁÐNñãº@«Phª0±_ßàæ8óÜ7®Ì9}A¼³ÃãB¶êÊ§i#xÇdGÏãÙäE ?ñ²û97bå£ÄyÂ¡kÀÊb-ì4Ml¬óMFV«[LìÍb»þ*k§Íû¯¬¿Kô=}=M«nVCñ|=JSS?ìõþ¼LnÝúØ?kz;jÓ@»PCÓ/d\`%-Ö½Üx¸®èC1õ%äëÿ2-÷´µ&W#»=}p:FsÞ×LL<94fþk¨T®MÍ¿,?³m'=}ÌØ"¨´K=}N#^FµQ/\`Ï0ã|iBzºße[<àN»50\`Îati=J&®¾_;nÎ[cRÜ¡U/P0=}Êþdã½å?öç E0{ÄTM\\TätYíÕµ.7»kå\\îÿKÁ=JmYs¸²@ýóÌtÆlÊlV@8LÃjyV=JÒzò	£WË+µg²óÇsô|[=}®²G?Ïú|EsÁrÅ7Öþ8Ý51ÐmÆ=Ms®Vy²TZÍÅ4½¤Çâ{ªÓJ\\grÃ[q}ço¬^W9²ýV07Ú-¥C·íÐ>ræ6Ä){û031ad5¹üzñ+¿}Ó¯~¯®,äºôm-ÀJQÇÊ)A~ÀUXë¦êdun=}{àTáÎ2áÎú_+¡s_½î[ZU9.££.Q­Ê"ÜK¾ª?M³¿sûv®j>V´Cw§û2:R!¶^ò@·Vv<Z8D7dðs®0zvRkÆvlº¶B*ýäåYÖRdñ¾¦s=@;Ä«°0nèNtL­ðÈ;ÝJPF´ÕN}kê4¬Sïûb;\`{$W|<Ë^©ìLã)Ì¡_=@Ø=JU¤!y¬8w6®Ý=};C(ñE¤:}C÷éû=@ì7dmD_Î+âQ¼X:KOÈZvÏbÜµ¶X³j:Ìh=J0=@"Òþ9M}ýU>>jÏS=MÑUîå;¥/Ò¥ªñãóÜÅG×©Îv®*E¿rorVÑ=M37K³'1óÒ¹"³ü¯Ôe¼E»vÀC8ñÔÎ\`Ox!ÙO]4vfµyrºÁs)U«Ðk0B:wd?³¢að#9ÎÐLW%B\`ò=M\\DÆ-Cäëû=@øLuPeÍ·×­Ú	Ã\\¡"ç¤vSan¼êáÚk\\<ù=@½"Qó°°ðâ±ÉâZ¨q»8­Ü«f¥s\\HY&"Õ'ô\\=J3¨|\`×^$ÉOÍê°0=MáÙðÙ\`\`i©Û%qï"K}'þ.æê5Cn·Fc?_öº&(GÍ1}Ý6!\`\`	é§ß%%ïÁyPÊ.½·ç·.1÷ ¼½Í£äÛ·A¸ÆôÔPãuÝäô	©¿´>ùcõxYßôW£uÓ!#"VY=@íÖdÙ8¸¯>×o9oHÓPÏtÜlÎ´Ü×¸Ër÷Äxâ=MK7ø4¾QW$Àc¥%BÆ9éùT¬mÖíÎÇüI	¦ÝÛßó-P+(8H¢­¼sàü×Ö5ÝV|eóHòdÉÿþzØæ=MKÑàà'íRçø¤ÄTõJ#t¯ºô$OSnHâÚÅÇigÐ!+¡ósêçù¤ÆeP(D|K×¼r»Iåh¾-3CüÔ§7ç=}ÎØéb6WY½çI)Àå¥çxçav¤ãæ=MÐÖðâA ÷AGa¸¦ûÕ Y±¶=}@ÓdQUÿ°|õÝ·Ñ 4¿ÿÚíæÝõuh]u«	-1f8â>Úiêâª+,F-X?Ê«=J,'Ñ$q#iùi]©¿&Á&0%c$÷ùV	\`	Tè¥§L¦à¥ÁÆWtÈ±·æ\`£ä£ !bê§ÒkæØg\`b©Ô^¦ûûÛÈ¬ík¥­çaö µ÷ÚÛÇä¦>gÖÂÿ)%´é'õâù%i§)&±	éÕ&Xèa8ÄçÈ)õTYQçâ'æùhõ=}ÉQMIé¦þû±HH¢z=Mëë%7æ=M%å½@ç¥xG¹e«áméßÁoçé£ìÅíàãÓV¤]wñÅ°Åü÷×Ï¿µAò=MnRGh_Sàuµ»´/¤ådrÙÇeÞ=MÜc½qQ8Ïw½dÿìõÀRF=MÜ_réuühÎýrùðøñH½7z¡ôI&­[A#å<$§KB@¨à³Ü)|"z &dW¾?|÷Qñtïë¹Áå¡T¦¢Óë±ð¸¨?Ó&ºDÄwIÀ"þ¾ù$ÿ½·Û¦üÕÊD0¿t§¡_5'Aî Û\`\`!2µÖYUõIfe#©ºÆäbf7=@OÍëÎoÇt£=J{bö¤Õ#=}ÝåâæIi¥ñç_Di øßîÕVÅNí@h96øïÆ-¦×TUÕ=MaÈÉVhæ Ü¸Á~	"ì m³8I£0¦F$=@àráÙÜ£ÏÕt¶Ú£þ=@ÞarPñ\`*¦S6S?³(c?¶¬Qä0]£=@ðMáfµoßGf¨ø]!Ç¦õ=@dðäía¿ÒoxøËsò#xW{×ºóÕ8!{ÄB\`¿¤[jðç±÷xH)¼ÀÎÃ9VzÐ¨½Áhùýá¦×¸mÑÖ¡OÚ|é&Þ¿%Y%0Øÿ¨ú¾13XÑÞß1Ø¥#Á×XÔiØ72µFaG".¿böì±óÕüY øA~Ëâ¹	5àÁ\`í#I^Ðí¬µq\`b¢=}!æ'U wÄ=@]!4>Ø\`hÀí9"ÁW1v(_äíiW¤=Jù±(ÏyÄß=JÿkïLEFhíÓ(?9Fa¡÷ý¡¦4¾[´ñ?4Õ=@Ìy&&÷qa_eÄì¯­ÍÕ­a¨ÿ[¥cà][çÊ§ÐeZ¯=JÍÏö~=@^ÿÎÍ !àí¤±o8Aºè7ÈßýiöþEycé^að×VÔ¬íÑÄx~õK¦ÌFNa8;¸;¸@çÇùKÇ=}]×¡"DStj¨qïøUFÑÍè#/]WÒ=Jz=@^þWHTh%¡Á¼XMwaµ'´¤N±xÆb@ZykÙâ¡ËÛ-¡ä¾"4ë:~2aYaÎ Á_wñçm	FÑÑä¸¸áG¨ì¤¦dÌ§ùÇàËç§Í¨þd^	¶Õ-Ò¥1(½íÝx¸Ðs¸×Gß3[_ ¦ô#ä#Ï#Õíl%$^XîëBÐH ¤Ü£Ë§9ñÐE~ÍÇ÷±{G\`ñÞ!¯íÞªuÁq Å»<£j¶ñÑÀø[¸ööKõK±.¶,Õ¸ÐûR1ö%T+³Ã's¸Éú!»B#5ÌÑKwçHØkÃp[d7ºqí+ýMñqÂgY¶1Á^Á8Ï©òbò6»EÑ?Ráª#6pÎG%ó&ÀÞ¨\`ZÜ¢ìt@5WbNb*5ÔÍ{ÀÜç§$=@Ð·u¨CÁfâ%ÐßMôAYÂ	õýíóUÇZS§=@Y'dÞ¤ÝÔG+°¨#ö9aGäq¯®.±.=MÄK­± ÔÍðÐ_.=@;\\=}¶Ýü"ûÉÄÑ¹D_à&ßÄáÁ  ùÈU=}¤ùã&úG¹E§£ø_õXÙÇaÇå=@Vå=MÙ3AÑ'ÿÉñ÷ÝìÿU=}Ác¤&Ô¡wFäôØ3g¤¶ûUâp·H_Gå Ô¿ñÓß'=}ñù%ôîÖ	ÈåBk§)$kñýî¹!%eü¹Ùy¡^:iÈxihßª7£äèK¥F!ai¡0saôDCùgo&	á _$ÛÞþ|¦ÉwÓf¦g¨FsØGN¨Öa\`UuÌÏ|·H¬y¼h­ÒÞmÌ9Wc+ÌLz¾ætºív¼^ú{¼¬º3ÀÎPrY»Ôãrü~N¥ì?à[þ¶Ï\\y	¢EÓ-×½AÖ}Ö¿»·dnÑ¶Åç³YG®¾·e!y#£ë$¶=}Èã¥?Tß{Âî[]ÁfÏÍãwå6vÅæ§ðÕyG>Tzô®£ÕàeÁ½O=@Òé"{U¡Gå>Æ¿ºô·!µIa¡=MÉÃAÙ|Ù	X	 =J kÏL¡²sFi©ØmAÃg5¾2q°Ù§ÙñxÈ(Ïìá[$±Xg!XÔí8û³ú=MÉãâÁÖêá·C\\¤=@çQÙç^ã#A×åw®Æâ(ö÷]NVækèÍØÙÑx(?aþQYõàIã ö_©ÏK½×à)·8X/tT·d7ÚxÞ	ÓEY5¾{D¡²sBg0"ÿQXÈKOMEÞa¦ìR)ã½qjó²0<Qöå"ßÑø+ïUþ¥Òú)Õù@VÏ{ñ(ó=}×¥u1=JÜÿÅ¡I\\d=Mö÷AøË{Hºd¨Ùex¤ÒfÕ	ËìÓµa9f-ôÄ!²%ð¼7¥8âMÊ¦·\`ç=M|P&ÉÅ©ò0Ì=}º=}ô¥ÄÑòä×ä yr%£=MëéÈÿ³_)åù6¦÷/ö}ÇÆÇ¥Yh©é£h@Ó,"Öäëã£ÖýÑ¢SXµªµêÿ[=@æcécêBòXÅÀb½Ò¤ÔÈ¡ø¤ÆÇ­$£ôîÿêç¬Nñvñ#Ò¿ôhÀÕÆ?¸KXñúDâ#ç=MuÞ!+äÞ&ÍcðÐ}½Íkþº¾Sö£ãÃ@¡U@ê,k¸ÁgU¤¥^É¨ª¨ÜdüêvùQcÀÔMpñÒM½'eV4jIÓiÛuâã1rw 4aÜøS*£G¹qó~\`¬EnÍ@¹$ÓnQÔ%¢cäè¡ÆAÅò¨æ@kM	D§RªH%£?Æ=MdòãÕ}}un|0Ë9^ýû®õ?¶Ó\`ÛR£EôÏnW¢¹(ÕÈ9öÁÇcû"ÑÌQwÛû±;¢ë¬3[øpQMèÈÍÀ?R)O¤uö\`¶}æ2ÉÓBo¬ÁCòö¿ÐÒæýá ¡c«éõ[­M¦³oÓiã¥v=MqÍ {òOð¹piEL Ýddgâ¡DvÝþþ¦GzumZóÛ¬¤¶zÁ?¸»é¸ÒÅtÊF~l¬v{Å=@IßWÔ?£ëË¹3ÁøÈÖÉe÷®[Æ¹Wf=}ÉýÏVò;©¬X/>ç¦´¥cÎÃ=@®JEípªCìá~ê½?M§?Ý	ñ#ÜÝéÂSD&¸Kq}«Ãe*ùSgûîÿtºf?b/×E\\2nyJóæFued¨¸·5øCÅZz)daØ{èó«+¨H¸pSõ½%¹FèïÙÝPNýØ{­_íu0%[BÏ·µaé71àIáç°<?{QØå"ÝPYÈfyÜRº¥ìH<öì wW4¥çN1ÈÈ"]ÉçÉX%ÖÿÕD ½Äî\`´_Û¡ùý©Èâ¨x:ÇU;Ð§1=@BÅÂºúåáDç±ïñ!Ôöâ/eáùÃbÔ¹]Ð6¹3V-tlaÆ§\\["èä·Ýçñ¸ß¤þÔ{UTT¢~ß?ç®ÁH­=J=JÒû	YÆB=}ýä¹UóMðñ!Hg¢"èÍõ0Yå"¾Ý°!AÖÿ©dàÈ[É@·ÿ©¦È3g&53³Ô{ÚõÜgê96cmÙHW6°H[í<l(ë)Wm¬ â%vâpeæ'çÐ"ø@ øõ×î¹AAÚOLøHÈâ-ØÏ£1Â_4¼xY8ñ¯hÈü¹Ã7¬o¦ÕíE@ÙÞ5i·Ùæn¤^TÔ~ö¨:;mE~ÔºÆ÷V¼ê²ZtoÄëëñ;ü\`MxPÚk¶|¥kqâsç4Ù¿y­b7|ÞAPR93t£æmd·n)8Vt§&(	\`J°ùµ^mîáÙ¾#×&#=Mßõ@UZRêiéhIæ£jEäåãäbe=My*¯©G¸ÔÁà	Â¥¥('yqæg(ßæ¶£Æ9	(,Í´VÕí%¡IÉg¤IEÄ×ÓÓæ~¶ç~wd\`}$!?ó'Å{cçO-üZSßÄËÍ¤	'uØ±Ll4½,à¾ #³ãçôsA=@ÐàVXábß5bæg´ä­è¿è§¨%& ÃÍ°=@ÜxnÃÌ«èÈØøI÷h¥$ÛmÃew}Ù¦KiYAqeE¤Â#·¦=Mò¸¿ÝQN7=@ÐWÏ<o40"#Ú=}Y^llïctõ=}ÄnÀX²,êrEîîzNÁõ$á[dáé	ãÚÔï-§ºû®¥p­ùúÔ2¾Uù¥¥ñàTêýCÿ¡hgãÚ¨{?´/õ=MR§)Ü"°Ï&Fßf	hçâôQÞ6YT¤¿õ%a¸ÇÇþ×¨ÏÌ(£3úiDç¨9Q=}3gY ©ÏCäÒµMëÎLHÎsÈOÑtAµsy|r¡=@[uIYÐ@ÝÁhýî$to9Í##ão÷4ätÉIF¿Ð¬ÙÇ#Ï'AÚ»èçãoå*Í''Íeî=@W²Ð§¨£=MJÈ~kFDì×á9ø(\`ç©'|èx®y	hhé ±²¬H8# çýÐ!:l½67CÞXwd¤ÄOçñ{$K×ÂÇ# =@¨\`üÁq%qT\`üÑÑ@¡Y¸ÍÄ°Ä3IG>=}oM ûó_Ó×ô¤­ù$&&¨ß´¢z¥èèã§B×ÕêÃ¸0	gbmßÁ _ýá¹ùØ)_ßÍ|ò}Þ%áyÈ\`Êã,Ø Þ4VØJ¡ÖÌb÷¤áÝØÍ#ùÞzí×¦¶üáÁ±ýTåDÎYY~;ü¡á]p m]èç©{	ôþ²¹yX'ÓyD»Ø>Õº½¡hhh79õU¸\\	iéæÄuv:aÔF5Åeqú t(øà´ (/D!£GG­°?a|do¤Z\\Ià«½òÂá±}GEïª#äàÜ}k1Ö=}ÉH¸Þ¢}]èæbáÞ¥sD¯YH¯7^,	iäÚâ¹ùá9yXGÌ®ÑàÌ9VD]n67=J9ãñt¨Ã' ïß'5=MD>:jãóÚ_ã¢#?V{ûüÚÉ®ÛÂôiÔa=@Û%kÝ±yjróÖ|{·¡OyÛ{Ç$î8F<)Ûl÷Pd!ôMR®ûöx=Jå°¿µ%¨i¨ÅÙî^A).áI)²Ex!ð¸NªºÉð¾ñ©x6]ôuÖô=@	ë4V=MnQïSxæ±ýGôÚÆ3aÒ ÞÐ­ÖMà^ÐuÆNWzÎÇ>É·LÏhíDa§-VVQLoóJÏNOîà8^ûÄßÎ´ã5î2$e%Ïüa­(7;jÔi¸º«¼?E=Màl=JàA¿NÉ¼*ìü<ÏOK|1=@ÕºüØ0ù»lº^#¬êhó&ëð)u)Y')[;¬<,=}ì<<Ü<<\\åM£L«~¬¢u¬êr¼&ºªe|*ÙJ»V4"M?k4o,8{RX3"mbM¿mÔª~3SFÓT<W;0@N|³Ø³~EÓX|§Î°>¦@ÓS|ÎÀr×»|ndÜVq¶þ¿Brg»¤Mo´k´oDª^23üu3²¾ª^FS»ò;NU|DüRÎÉrf±^HLüùr}ºÐK÷j$/@üFÎ£r5º@KWk$?cütÎÿn×K×q²ÞCUüreº K;Ì\\>JL'¸1³º¸JGmd«46ücÎ5r©Lpä¬70üWÎer!ºHJgl¤¬6/üUÎarºJe¿hK§k$p,~Û9(»Ú«sO=}<2+nï&MãM£Lkpomq4j4lÌ/Ú:|;ÎzÎrO»Ê«Q¿kT±~+3ôá|b<¾YJdî&MºÔMÿnÔ·~AÓh|mÎðrw»ÄMßn·þ@³$¸rÇÓÇdv<;v;ÆúÆýæûÂýb{ÉÒÎráÒ¤L×q$®~ArÚ*G|}~Å»*S¼»HKßï,ÓPºN=}ó¬G9Î°jÂõr§Û­§m$/ò}0åCÎb^øIe;ÎjÐ¼b¥m,Î«[-gm¯ò¢JqÆkT*ó§ZrAúÛ¶¦ªSJÆ&ªsJy/*Ýjæ^i+#¨ð_12âDñõ6J¯ì¢A²¸+Óz6,Cñí)	XJÝ|Ò=}EJ¼Ü5:ÝN:¢oÞ;ò9¶­(õCJC6Yé+s%,sYqËÙ_úJÔ/²Ä1{9,5§þ2ÿ.°ôJ}vîåBý\`B BJ¤JyJ:º aöo9ö32¼hÂÍö?:!aJ^JJvuJN:a>²5î0,JXrró@²6î/°,M«âW«â­ªâý**é+Ù+wÝ{ñþ_IXnµû0JyJ¤JQJ0Þ£=}8®6=JóÝ=}§·èoI«ÖQªÖ_9Ê1[0jþiªÒ7yx¶ªÎ	ªÎéì+kù*v«ÆqªÆíIÖ«Â!ªÂuI×g®Ýí3A*­@êêG¸3|@ëB=J+=J=}ñ4b+çV-8¦[FvT9Z±í[cMÝ+ñÂ%¦×'g6ù[hÉZ8u»I'Üq%§YÌhV>.H¢òüJW-LóüËÊÏÐ¬"±Ü=J[8b)uCÎÞ0ó¨B>1@CN¨2Îþ­ê	R7Ù¾"2Í¾ã=@R·ç¾¦gNES]÷p¤Úñp$+4à¼FUmåê!Õ×îÌÎÞ3 ü­ üJ¥³7®¼/:ÖÁ­EJdrÀ&PëZ½y½7¡¾ü@btú»¦÷<éÀxü­Gxüø<V»ðø»¦ÂÝøïßÅ³ÅÓâå¾ßý¼¤r gN	ëÈ<]¥sUçÎ1ßríI»¾æ¼ÏÜá^ ØáÅ8ØqWó÷¤ÚgÉ²ÉWÉt%ÂÜ	Y#xVJà+¼6ql9Ê·d&tºî¡0uÃjîÛSK¼l¼ß£SÝ¤;kÏÌüÑüË|òÜ9UK#XSÛDÏÎÞ@ÏÏ1§ìÎNàÚÖz©£óÏÌ¾ß¼¤ÚV$Í´7²ºüäqt >ó!=}½¢gµNY³¼H¦ÓX7}æÀ¾Þ8$_ÿÁÖÓ7ÎöÙ7Ï1ó·ÏyðÐ|=@¼FúlÜ	=@|þùrýs9Ôj)etkóüÔUðéå¥Ó±¾ßâÁCúq¤:?W§Qiñ´ß¤_=Jþ®:ý­"·__=@ÌvÖWúl¼l«P=JDX7EÅ3Åx£º	sÜ¾£tÀ±kÜèB.¤*=JÍ{\\_á»e¬éUÏsË¥OýoRÆ=JBY¡auÐéÆÎúËX|caó¼ùmöu\\øUÈ»VÛ¨¼SÌªÞäº¾ÃFLóµrË´uÐuuôsÇTuÐúrSÞ¾NÙÖW R×HFàïcÞ5âádjG¿J@ÏÞ|Ô¼ÓífsÈÚ¼U¼vg rËh±ÎÞNuëÅü»ùNýY|ÐÍMì,"ôP¹z£þcgÈk87EJÅüpôýô§ôPÐFÄÑV©XÜ]ÖèCZG2aÐßZ\`FZw\\ÖÝðîº)ò:¤ê^wY¾=}DC­·Ð¯Ý¶Ëy]¶§CW#eà[½ã´·O[íð^%Ó÷a©öQ·Ú»àË¡áÄÉÐ2ÛuåûøÞàí 39%ö÷ÑøÚaä£ÇùKÝp1}ñÿ8ÕÍbèSÐÞsÐzáÕPýÚ¼¸#~qãîoqýâ¼úÁö'ÅWàÿÆYeHS Üæõ§µêÏ¡¿©u7g&ÿþÚå­éüx_¡abHdä»±¦"¾q=@ÈÕÅ&ÿõ%5ÙößS£v[£eXùs¹x)ýeüzI½uH£óxã¦PnO97Á=@ã¨õ)ÿx%ÅxwRºÜxªÏXöèáÇ2ç"ÁÊv	ØëÛÚ¬Ë7KÐÔÁmüÄW^­ êÒU=@v¡Ö½kjdy0G²ßcF.p!%Üõ­>º®/É ü_-"°÷ü»X|ãV9SÓ>©ÓvÑ:uÁ<ü¤ß¬^s_ÓÏ°¼¥Ól¨<U¿V]ýÏ$=@sók±ÏLqu¹ÄuõigUaXf]mÈkbÛÌqNí¶í°eaº$´ÛvÅQÙ!"¡²Ú×'Ê×Ó¨¥åK#é?ç¨ê×8­¾Z¦ »=MÉAÄ¢~'ßëO§ÿ«9äyÖ=@]õ\`Ùk·°ø]"¢x%(;Ûõôhÿ©Ä'ªUWm¬©(bPmw»5à®½|Lyè«ÏA¿F sÛ4ïA4î]ÕÿßÉ~»W¤ ¡â!ãwaYTo± OÎ¡Èú±[Í¨ia	e3fâ´iºkÊ-Ð¹'À¤dCÎq3pø|Ó,ãj=@yS!&üÝGoÏâ¿ÏàDtËÉ¥u¯h¸ÁL9½Ä@¨V VKeÅN)$ä¦ÎuíØ¡6£æPCEdÞÚóFîWÏÄÇÂ¿)õN½SfÑ=@ÕÆ¹CÐrmÙ]¢>Ø=Má¦ê´°ÈIE$ÝüÛ±ÜLfÜÕÏm÷µä^$£\`è½eÅiêç{A¼ÜjºõÕt¶{¤ßúx/ÇÎöòfü¾/ÏíÏÖÐO#nó_¶^²Á¿Çÿ­Óøðk½AOpóÅevÃ)ÿ\`XN¹öl©¢yèêÕ^ÙìÀÀÓWâÊ[%Ü3M]CWíSþÞJ½ì=}x5sÀðßÏÿ}O!9Nã=@:Èø=JX^xÕÚ=@\\OVxdãÃ[÷hc¦Kã«§#5 ÚØµïÞÞ¬wt©Y?M÷£©s´Cé h:JaÛ7äTYöìühU¥e>3'ÀF»"­ (3(=MaXX£'n&§c¦Qmu\`éyZT¤úgòhZØøòôó×¡aDüX?Û%Zä½Í'Ö=}É~vÙ¹á¨Ð}Àu¢yëèùÑÿyE¦ãÐ@éªPÕ®çJ5ÞÀ7ÔbþîkPÛÐÃ´í:ò>èÎN÷Õµ1¶üuúÔhO°<ÍÝJa=J_Î~úsf:_F(0¬¸V4dÜ5Øñétï+Ü5üÁ²þ\`0Ë50¾gô.½ô/<,YóqôY/mÄ:Por·êá& \\É¿_Ó½X}^	õ­"~)H^ÔÓ|Ø»ê¦ä°¦)G_Óõ|ßlÌ+Øî¼|<0 à£Íd{;?uA3¡lÝð±7ß§uk©aq£"»s­¤ ýÖk×RcRÉÕf¥®û³-$ úÔsç»¿ô>9¼ÁøuÉ&½"º¨çäÞûÚ\`Ujá¦S=MqOñ9¶ûÓ}sÙí$é­Ã¥¡é¯üý$!åYÃAjos¦îQ9hhb}^(ÉUa}Ê´m	Õph¦!W·ïMìØ°q}<L)äZöiLè¹£?[×Î$»Í!´¨éqÎ%"»»A÷²fà£C?¨fÜïð»=}hnä>ÜXézdÁ3z$&ÃÑÜ<=@ÖÀ¼HúlßåS½98~\`÷ÜT÷¹äâx{	ÅÓ6éÜzC"¦¯óÍÏõ8ï§9?cÖ¤CÜ¼èÀþ&Û'ï&Ao]Úª  V»M¯?ùóV_çËi\`~*ecÏJå);\`^Óbt]	ì­?Æ{cy¯'[óì<þ=@T»$ÂpÂÐé@=@ÖÍàÖÐß-%&Ó=}EüàUâÊeõf½Çd	ÅãIõøX¸'eñÜP\`-S-§íÀû25\\¾=}Ö¢à,Å BåÝ bE\\¢.U|N»gbÄò@t?NÛ#½ð(\`PJ¯IÂì=@rÑÐÚìË\`ÐÏ¿ÓMÖFUeèïôæ8(i×GUå þôàéÛÜ3I×AUå"÷ôÝÖcümÎr®a+³ñc~O+Å×þ/;2î*¬=J­-êñ¼5ÊzErgÎ@Ç¶>'ô¦oãÉ{ñ¥þôìÈ=M%KØ=M(fi[ñ×ôÒá¿ÞÜmõÖöIaóô\`×JUµ)D çÆ¿÷7àÜÖá>à=J4%#4eÀÃì×uÏÐÚ=@> Ú¡4Eýb¯ÏvYÑÚ°>\`k\\e¡VÃÂöwym±PÝW½´ól@h³çhÉîsÑPÛQ'¼¿dsöYN³×(Èòðt\`QÜÚ3³nGÈòpäPÜò¥MÇMüóMí".uáIëìX9(°Ý M°Ýq±ÝíhíÑ%íàÖ{Z\`ÎZ BQ«ÇÉêÔNNÚyV«cdNÚ(ÑËÃÖ±¢\`SRÈo¹ÿ=@îÛÛVTV¸9±ÜÔm±Üt±ÜÛ°Ú<°Úì-±Ú"¼mèñ­Ã´ëÖqëö[)¥:g/ìàd­=@j=@ñjiº¯6X9£P9«{-¡'CÿÉ_É]! ðÜ'Ã©( iaæI|âIugAí ½[Öï\`S_Ä¿W@÷TÆõN 75 g¸ Á0 Õ A ä¤ÝSU¥Û¤Û´y¥Üi!×u3Q¥Ú¡Ûg£ÑHö¡àãx¡ê©a\`ÜEe=M	·ç¿O^ôdfìÀ·ìD/¡ñD5A<eÛ«Ç)?GTG½GëØGáý[0 Ô k ÖþàÖràç\`Öº\`öTßiáhè×ò×Õü×¶W¿W'=MWË@W°Õ÷ÃÍc=M¹ÅÛq-Å[%Ð} dÕ3e_Ô3õ	®ÇG	Â§\`a}©îüD[ý¾°ÃumÃªdaQ=@áFÝyiÿÍ6Â_ÏX¥(Ó8e_Þ85£{Åg}Å¯Øï(µsÜ£ÜÃ_ô_7ÿü¬ÿùÝÍ5ÑR bÿìç×ðÔð´gð& T¢3¯§ÂIó@bo\\_[¬¢¿ïßÓôF9(ÔÚµìHbÕÇzÃ_ç³'ÿÊ<åÝçLµ3Öò°¸ÙêèçTù¿]\\õÛïoõÛÚSþå\\|å\\?9½mìðÏõÑÏ=M|ÖÀ¼ÖÙsNè.µ#ÝbÕ~ãbÅbåB'[¾GGô YôôSôô7Sì"ìóì"®l':=@_T®×zºO©6aÄ/Ý}¬måJ=@èJ%âMª?5á¥AÉã'Ýû%'hIig\`I½ %ÜÐ£§ïIàcíÅä£ÝÜ©õíÚæÿÈö$­×ë|äÝ1¹íôà¬5Åú¯§IöFQàÿû³§aÀdÜùwvâ³ÿGê=@ÇÞE§µ \`×7·Þ»iCÃ3-E=MuõÖ|3øSUe¨H§ 9#ÌF& sE%{ó'ÊÈxÛ5¢ÕÖ(&¿ý5¯ôþy¿±;y¾ã&»Üzó%§p¥´í«eôÞá¿Î'a¿íÿRíþôÎÔ?åÇ©S!õt&}ã;¤{#£O)Æü©Câõ=@Â½ôñ¿Ëñ¾c¹¹RoäF´bÒVÔ%±\\K=M¡¨=JÙ%>	æãi\`mS#¹ÔÏe¿¡RÏ¡'ÐfYÜwSgµâ3IÞ{ÛãèÇ|¤%DúîÎ¿ôµ!õ¿AÀSsqÁTÝôW{Ô÷Î¶ÚÒþaØ\\×ôFO¼tÂ'véOïÄ\\ >=@ùtý½¾Ï1QRýlñU«½ðTwÈ)Î.aC×öf|»ÐéÉÌÖÃÒ&¥Â|ärÆ&Jï©rBOÌjIÏg¾±éx_Î]á¸I×yËî~Ô¦zõSýeþ(ÒËödwcÃFÓÎÀ×Ìâ{báÆíZOtTÓN3Ì¤>ÐSÒiBÊ³ùÙ&³çÂqÃ'½±üèæÕÜ%à[ÿkËTyárå3M1¨;ØôÍòðýqÈ¤Oáò5»ðCQM!gb>#ä&SåM©éç_Ü¯»ðØ²££{ÌL}<Ñqèi\`[üÆ)ÑòÛ©Po=@´I:ûÕï÷WL¡_ÔG NfÂ<»ÿ¬-Luâq=}#Ç;æùoîCx:{ =Mò²ùÃ·Mè±µR¤ÎÆ¿ÕÀtèâ×k¥=@éÝïÎL¥ýleçÿ&ïõ h'Ð¤Å]	WÝhpfC½<­]fÀøRzM\\#ô¤C5F¦]mgcb=MÛ¡°	[Cù<¨øzNgÍ%ïãC	pYóRðÅE\\Q)ÀÞô¶!!ÖÃ¨N=M¶@9YþÅ¨WÿåCGhøBfðßI](gÍh­$ÿíx×ýÎÀÎ }Ùß~ÙóÕh(ÕÈØÙ=@ÈEÒ\`¤~zçÓ²T·SÐØb|gApG?'OßÑp=}o×\\ùÌàåm§Ô¸$SËèdMßÍm]=MÀºÃþ#Õï¬eÕ¨çåÓÛ¥Ô+Y$ÒOô }ý±8zIÖp©²}ùDØ(ÆºÎø=MpÎÓ_§qÓå ¶yáFÍ¸¥]ç_æ$ó³êÍ½þçPÕm7}ÿE5ÐÓ¡UùzýøÏÕÔ ÝÿµÒ©°ù}eÉÇÙ8¹Ò@^Ve÷Ì@8%whâvü¯¤ÿt=JÂÿéß½·þÅ{Eþ¡A\`Ô}$©Ì\`ÆÞwéÚm7} ÓÑxI¡Õ¸¦¼ËÐ9ª§ÐZ§éäRªdIñt±þ%9Õë7¹ÔáYH}gåÆz©¥¢|'=J_=MCßÎÆdô ¬§o_=@¼Ä¿¨'oe)ÔI×ß°¤X"ÀÄ#ÿWØÔ(¤ygH&j×æËT/fmi{Á$f}qÎiäè~õw¢Ï¤æ{Oéyç¥ÑØ³'Êè%{ý(ÝöAß ×åéÕ=J»gÑO¨¡æöánC¢ËY0Õ»é¹à÷­£õà&>eãÀg!)ùÁ =J±¤Ã"Niq(¾M©]ôö~He5Æ£r=}A=JôI¥äÉæ¦=@k¡èS­¡Yóaýp¥£¢ê×f&æKìÅ¥÷&í¦#ÿÑè hèYô¹åh=MYÕ#h¹&#!/¢ËT+&×*¦J)d²¡èBîÅO/k/#Ç­/ã_P®ÙWîeWîAÞTö%¦Tö#æL¦{è{¾m£[h[ÏbY¼ÆIz¬iÖ¼yé¼)H´9!V÷áV÷±þ9=Me±C¨öÙVÉ(â{cÈÊF!rWùI¤=J/Èáo)oOh	è\\I^é\\)MVÆùf:øáØìáfØìéP%Lâ.ù6µÉ!ow>¨°ìq¦#ðÕwÒðÅ¥"÷W&Ry>Õdy5ÿ=Jþ=J%%ÿàçsß"mh¨lèê×8Y^Ý89ÕõQYÔõ1>Öñ]þ=MlçOE;EDm°&°°æÓpf¦§MÈ|æ[Yáä[â3ééÞ3éÊS\\áSYÄÑC¹Çü¶AZ_q\`é©ø¡6ëhëóg(óa_ï¡àoTàüÄ=@fôé7©dÏ7)Xáí°ÞàuÞ=Mw9Þ=MçôßáÁÞéå =J¸óG"¸qG"ÀGã¼»%¾îùîi§dhd¢áï"EåØ&éØæôØ&ïaÈ$çEßeÉ(¥¡Ìz9v9Èé1Ù~ÕQÞæQ)íµùµÉz¥x¨ç£í®¦æpóhæ(h¦í÷h¦j¢hÒYéöÌã^y©<÷=}Õïç[æíBâiè"¨æ(·¨æVÉDõ¥È¸+'#·(¦óÈ(¦¹í*Ô*(*!*)ÏjeJÉ¤J¡BîáGîgÁ6ÝH6­t8µ19¯¡6ÁëæÖ\\®vGìý!91¶m£Dm£Ëæóm#c¸Ù&|FÜU¸1çµ=M_í£pfIáVÈÙâ@ùw=JÁEPAÍ=}¢g3',!Yf¶¹a¶AÅf¶AùFð½	6=Mk¯°æ×°8°é7©GøgfqãÿpKÛM"¬cM¢ipEYp¹è³ænÈÙL9xyM Nê³K³¡RÃî\`w¼âÆNhy<£W³9#Èî>r¿(ñ(c[ÃYÄ½öÑyøPù½c]Ïè/}"×²>èÜ4	GÅì'¨tqÏ-Å}âË>èt4)o4)÷#ìô=M£»\`Hüô%ñãRU©bïô§#YU×æ@UIäô)&íô©dA×&_U¢ôMI£5Uéðô©ÚgÉaUiGéÝÖ&]øèb%Ø(®]Uøæ/W¢ïôHÝÜöÇ=@(UUdûô´6ÞÜ ÷Ö¶ÁÛÜ\`XKøf¯Â»ì8!r§õÏZu\\¦bÃ÷ÆÆöæÄOÝHbÕÈx9PPÛ°_¼µy³îän ÒmLÕÂòØEëà¡BëøòMÓíóíÀÅíÿ;í-¹ö,Ý3yjÃµ¢ ¤F¥	]¸ïgHôEô¤hCì(g®'¤Z	Z5i[²ÃJ¨íjàQ	jà¢* !s©\`Ës©\`uV½g¯('Â%»BàMZ°G³µë2!õí0÷ ©ï¼¾y\`©9àvëoýäÛ0äÜóaåÚàH0u\`×©QÆý»c µáÑvÁdáHÌ¾=@Y×_W!¶@ó³ü¿Öò­ÐV=}\`&m(Mà ¥m =M¥- (§\`g"äX Ò8£ç\`Õ§Ð@%¼½·~­ÅÇ/¸·0#ÀÿÂbÁS2"|à?àÛq@Ï<Å»Rù¼\`¾É<õÜ»ßõZ!Zà)|S¼ß¬ÿ3Sø7}Á@yd?­¦5ÝlmÂ¦kz3Ù,Ã÷Ù+Ý,ØùL%Û×Û¼Y÷à_öõ=@æ	¢ÜWgÖóJ@ìÀ×sÿöîÉP\`a=@«g¼päW¢}\`öâê|òV)Ùt)¿ùQiSqèè¢Í^'$|ó!Ó&nã(z££ysæ×¶åË®ÂÙT¶Á¿ÉXRõÈÈxeÏf¨à²ì©gÒ¦É"å]¢É¼á°L×ËæÔVcÝs#¤Ò_ôÓàU¿LÏÀSÎOô]5¾É@ùîø|Ð®ÑUµ·ý¾¦ñ©vz¶I×ÆâÈÔ³´EIÔÓcÏóØtÏ¾VÙ@týÉDT	þ|ØÐbI3¸°¿}ÐøVË6(rCKjcåq³!zÖíö´¦p_ÚµòúçáL¥cIò=MzÎí»eeÙµF>c§#Þr%ÍMg¸ðp¸ÚHcwÓFãVøiDmû¶};×4ø·|a¹¿¥Ôp¸ß~ÿH¹!\`ÃÚÙOeGwC/µ°ö¦Óæ\`=M²ËC#@¸÷²$ÀÈâü¶[aÞ õòòðæ¶i]¨¡åÁûá¶ÈEÝ\\OÓ§¬Æÿùé¥Ôù¤}u.ÓÀ>{ÅqÀ|(VÙÈG=}Ï$øØÍ89ÖÐÓàÔkÔÅdèÿ+¢·Nßï°^_óß»=JØ=}ÿºã½ÿÄÐÓQ¨{áÃ×hayGäËD£¦³ý\\ròT~íßâ7aÕíþÔ	÷GÖ§©g~c}WþªèKßô{_3¼ýÔÞÆ$ùoIÁBÖÓjUÈå×Øh¡y'¦$ËÄ³$"!ÚÙþXÔ©zy"ÖB$w·WO=M<ÃÁZ%\`æîu(ã­g«ARò%÷_mfö%q£ó<¦N9h³QézQ9¹ÀÁ9$÷!ß=@=Mw7##®À(ÞÜ*i hªIÙ;îwý¬£ü¿¬fNÎ:)@ÂE\`?´ûµùm´SÅu ÖNáY|Ä	>ðyÑÁq9ÁQiÁ=M©?ÕêIàÓòi¶Øî7EU%iíã?(TZ¬É´´åSæT=M¹=M§¨Ý­ñÍâ¦åd!¨­E-ß£ÕÊd¦¥ä&ã¤&¦¢§(-7£7Ï;¹ÖÂéÖú®áUÿ¾99ð#^qwW"±¹W"ó¥W£íý×"êÇ×£Ï¯"&Þà¦á ÛÞ(Gâm1èqÈ(Q?	Ã1ì¡¥ ÁÙ¡=@¿"æoCúPÙ¥ìÅ¥äÛç"çìç#ñç£hfÛp(w(%~i°¥GíÙùñ¥~³w(´µ=}$H-¢Ù_-jÍ6Õù8Aä78<1kðK&âK&ä£R¡É^¾ù^ïÂû¦ôbX70×aÈI»ê§ QWO°Cí"Èyí¢û8í#gí#3É;Z.I¨.YGºòm0O\`%<#;ÑNH	T³¡ºîqta­½£l¥k\\¦[Ãy t\`ÿ|"Ð«S¦$ì>è$r4©!T¯ñ££?U¡ï=}Ö¦^U)âôô#¾}è&ä¿ií¨×¿å©ëë¹Û)-¥ï§UU£îô¼@Y'Ö¢sUUQ¯(c¯ÃuÐZÀÃöÄÿu8QÛÌ½±Ï³VM.u4(Öê#öe¶£@yßïÝ×Í8m=@=JÙ=@Höfu8#G0Ü¯Á$Ý5ß '´c°ïõ¦E!]Ù% ôí±ëXVàrbÏMU¤Ög%óÏGÑ7%U\`{5@Âû¶ïÉì¨ç²êØ&¹£HØí¼\`=@ÏPÀH{Ã%ru~ÉàÕ<Hæ(ÜVÀQËN#ßBÕZÌRÜ:eãJ¡Rº×Uª×Hñø¬Ü§f¶¿wÀÿFáàë-UUui½\\EO]ÏÀ1tî=@t­_êéäÊFsfÏÒ×¸Ra´(Ø6¦çÛåÏ	PO×êD$¿K[5¾¨ Ý¾iy8?ÉÊ\`tc^®<>=}Õâ¡Ì®Ø¦5ÖÏ.èÙÖ>(çâÜ+Ï¡ÏÀ{	'(¶Ý»©ã¶æ¤kÁcMM!ØF]©èòc¸qL´×ÖD»c¼_0'Çç7ü´Îå öò}¦peåCÛ¥þ¶=JhÁ]DÃ	ÙÀÈÏ¨"]r³z¥nExÏÈÜ¨ÊÜ&Q³ÔÔñ¼Y=ML¿¡ØÜÅßWÑ¤Sµ' jçÒä¢p×)ÑDÄ$ÔG_h»äY"¯$Ý=Me­ùã8<Ù÷òÙ"£F¢åm(ä5ûðÇa Qxü¦#<#£è]/¢)Jè=@P®Â{Â95±?]ætgi¯ìYôGwTÀTeì£çÄ;æ)B¯ÿ"îAbñ£?éDþ[áø7#=@ ·ãüÚSÉÛc	ÄáOI&Ö?)¡E(ute¨ä1{q£×¥ahé9¨y(NÜaéÝÔ9´oäî@$ªÛ¦nË+æwÝ«¦úkæ!Îëd2©ZR)pFys·]åO7Fðu7597SM¢¤L¡h4é<éR³%wôß×4ùéV¯I©ÉìETh©®¿ø£Ñè7bæ,"Å8Cÿ&ãº¯»SÀð NÛ}<ÅTM#íÂå,¥S¸ÒZ®cÂ0ÛÅ%Ýy'þ[§×çGCº=}þòõ¶tUfßCãÊ;^ÝHeH}µoA²É\`nÜ/ìÃ£ ¨\` [ Kð°0Ü¼¨ÖÛföãÛEÝõ»ïÂÓs	¿UÙ	Ö9)|bÓ¶àaÏµÿtýo¿QÑRÛ!pTQ¹îR@_ìÄ~|øöÙæzäc?ÃN÷·6#|QüÈ²a3× ²¦ß¡ùèCçeØöôâÄ&Ê8Û@~õi²~Á¿Í@^2HÍ¸áÇËÀißrçºÞxWÞu÷Á"±(úCî½A¹þm1	Ó}¡k!âG93iç4¥##öJÈsBié,IÝ4) lõ¥±óûDªK÷#¼L×£!"ë,Ç¢ÁØn9¨SÐaáÙ:÷-X=MÕ9=J¿9 9q\`ñæS3&§«fR§.ø³æN(#\\¡Âì±=@Ü÷¨ã¿5µè)Ü/Ëý6ÉnÃäX )TÅõ­zÐù\\¦t¸ÜÉNó	Nc§Fqã¶ÖòP ½é¢3$R"ÞÀeõç¨ ½éR­¶ù£ÂÆL¹L±óõxÅÌ )éÌØ#-¬m4A3Wænó|ÏuÁSØ¦¯´¿T¯ÓD;ÓZ³ÔÍ×ßµ¤/¯°2¹Ö@Ý $7D_=@Ü Gd=@Ý¡	Â¨'18¸uBÈÂ¾¼þårã²Eaè}Hç$ð6B<ifSOþ³½ÑÏùÆ]ûÙUÙÚ£ë&V· ¹CfVâÉÑ'\\ûßÅàô¡îãu¥"ÁfkD¡GÂfh§ë´7]¨iÇQèâA×Ì=}Qøè£ùIQYé)ÝjÏ$%ðÏxÂh¡óÔ7 Ó±y)£'½ÁÜlV%ÑxÞ¨«}Ái¨'FÙ¡Ö&ö×Ð·%y"!ÓeÇ´þÈb ­Aè$Tûú%XhóÜYýøäÂ'ØÂ_ñHÁÇb# å¸	$Ï¢Ö§9Õ8¢·Ï] Þ·BÞqEõ²·aÔámnáúþ)Wðéå ÜvËÅYþÓ}19ÂD¾ã Ûlßì¾mù"=MÃÃÐn?ÏF¤X$qcWoR±È"»Mq ~{g±"á©)(ÇeyÞ>ËF¤ØM19HÝ=MÎÒÌ¼æUÞµÞ9|uXäS½AõÿNRJõ§Ü­þ1Òz~HQA¿ðs9ÏdzkÔ-8I#Zæ´6¾xu~6y/Ö\`»aówÎw¼ÅfzhW%jI¼~ÈWÀuIÏ\`xã7®#*¨Yó\`úc*ÁÍ:ÞÔKY½*áH+sQGÁtò½<üNÓþjQaº=@ë;i#âO7¿øuãæ¾Xç¿ò@ü\`óuHTÉÁusüSlÈYqrÏÙ|1£ÙkU±´Â=}¯wmºÆ0ç^QOz5,e­ØÐ¬§ð;2¶1¹±×l£ßA\`=}PãÙ¦n ±(C^ã6!k!©Ý>@>J#¶5·õú=MÉM±í4=M=}V+ óyU9ÁYõàÚ*#-2ió¯õ9 .õÄÚôÚ¿¥ô©òøÚ1c+Å®ÉË\\']MDìmbõÛ3c9ÖmXêlAã,fë=@=JaãOÖ1ò/IàLÙÚj¸®ÿñaHòGé9­þw9¹ÛMxÎEø)Àô{ü|ÂÎ½!õ¸|Þ~TPyºµs=}Îñ|g£·y­ßUhTíÅTUyÁõtýÏ|]£µvL£7dU½pr©sã²ÁdAh|óå üSÉfl(uà½¤s1ÏìBãÚ^0êß?W¯±ÊLÁxL&ã¾^¤X_¼aò·Î7¼µhS¿Ïµja}ØR÷¾u×Uå¾¸ÁYô/Î>Vø´æzÎ¯Ú¿NÕQs¿4æXEeVhpó/a1àEéôÿ+¾åõéõF­'ñnãbÖÈê¼×I ZcphP¥ì<FÖkò}0 GÚ¸¾±òiÖE\\yØ45ÅYÚMá±×¶ÉÆR»2@PLÚý£*»¿õçªø?àhÑ\\oX7ÕÇAÚFRa°'·ÕfjhO¥íyÉö¼Uë°-r ò×·=MWQò©ô+Ú-ä+¾o\\­oy@ÖtâCàc+ÜèkDÎ¹ÀGXfØÿ³¹Ööúïçíy­½«CÏ¿x×\\\`8Û\\ùi¦Ôï\`Xø¢Àìô½ 4ÝæÂÛaf¯7\\ÍÓà¿×¤6Ôg¥¢Ò¯XQÛ8«°s	¼J«{Ùnà)¹M³%W~ýÐ!ØîÝÖËý*êZ\`	_s§U«gI_wHù¾ù=}þ´!oy}í¼°Ü0Ó­°7MTW~·û­¸Cõþáw0Ûç9Ò·u8À´ÅÿÊÖ(vxËðI¶ZþxÍ$ÛfY¨I~²'¸Ô/Ø!qÿMÓ9ÅÌ¤ßa¥=}GdÑQ]àT% ­0g~©È·!¦Ø@'¯?ç	è]ÅÝ$=@¸^¨ÿú«#_ïßÛ®'à¦E ¨Ø-!	´OîÄ£ÃUWX&ïÑòø%ã\`qãQùö¦°I5^Q´%èûi'"bñä|+"Ð@55ø=@ßà>I­AÂùB·c¾R4Uþ*V­ÙÇit=JWvØFðÑ Øî¤XWõS>O/Çî°¥FùB¢±=M°\\bôR½Í°dbÒ½Í°\`Þ¯ËwFMqCöû °h¯ËyÚL1áCqC$öû¡°[=JB5°[BE°[BU°[M=}[°[Bu/ô[à4ðÂÖ?¶cñUÂ-¸ãzZQFÍ¸btëÆöÇ¬cÂu/ô[á4ÂØ?öcñUª+8z*=}FÚË*pÐ*bq+6ê¼,ÂªW/Zð+4¸- >êJ1VTªs8~*ÍFÚÔ*c+6êÜ,Âª/Zø+4È- ?=J*1XRê38zªMFâ<3ÆêÇr=J:1Xo,ÑbU<bð«»êc8µ.8=JN¼-aMªÍFâD+Æ|ùúvÏçwâuù3¡SiXçyâu;|#®å~IXÿyâuKÏ ;|¥3¡Ó'®åþIìIXÁÁ$yâu=Mkâu=Mmâu=Moâu=Mqâu=Msâu=Muâu=Mwâu=MyâukâumâuoâuqâusâuuâuwâuyâujâukâulâumâunâuoâupâuqâurâusâU=J?âuuâuvâuwâuxâuyâu"jâu"kâu"lâu"mâu"nâu"oâu"pâU9âu"râu"sâu"tâu³¨ýg¤p£RYçm|C~@¿s}G~Aÿs}EÒWþPEß»tÐà}IÒYþQE»$t§ÐèýBúúÂúúBûûÂûûBüüÂüüBýýÂýýFúúÆúúFûûÆûûFüüÆüüFýýÆý=}6:V:v::¶:Ö:ö::6;V;v;;¶;Ö;ö;;6<V<v<<¶<Ö<ö<<6=}V=}v=}=}¶=}Ö=}ö=}=}8:X:x::¸:Ø:ø::8;X;x;;¸;Ø;ø;;8<X<x<<¸<Ø<ø<ì'=J\`âÈ=Jh×+¤£Ê_lÙyÖGÞ°³þQ=@D µß²=@Nç©×Ì_uéõwýñqÖÞ=MQ=@l=}?O×Ã$"µß¾=@~§¨îuØh©WÐ_ÉÛýÄ×ùéõwmÖÞM ,=}"<¥/Cd&³ç® >Ghïm¥¸8éYÌgs±ÛûÈÏíéõyýmÞ"M l=}&<¥OÃd(³ç¾ ~Giïu¥Ø¸éYÐgñÛýÈ×=Méõy1ÛýÈÙÙI¬@JÄj.×j^­è(2¬4§§<Þ0ûF$$O;ÌswúTnÝÉÊ²Ðûqk:÷ÍÙÉ¬@LÄr/×n^½è(4´T§§@Þ@û$$W[ÌóúnÝéÊ²Ðý!1k;÷ÑI¬@NÄz	.×r^Íè)2¼t§©<ÞPûÆ$(O{Ìs'wúÔnÝ%ÉÊ³Ðÿ!qk<÷ÕÉ¬@PÄ	/×v^ÝâcViJû ¤xbv#éÐ!3±ÓfìTÉÂMFÐ$3±Óg®íþhÌ9Òç®íþ¨ì9Z¹Â$ubv'QFÐJFÐKFÐLFÐMFÐNFÐOFÐPFÐQFÐ#JFÐ#KFÐ#LFÐ#MFÐ#NFÐ#OFÐ#PFÐ#QFP¢JFP"JFP¢KFP"KFP¢LFP"LFP¢MFP"M$¹=J»Â=J½Â=J¿Â=JÁÂ=JÃÂ=JÅÂ=JÇÂ=JÉÂ«Â­Â¯Â±Â³ÂµÂ·Â¹Â»Â½")U©Öb(Z\`ÂJÁô5Ï=M8E¾\\Bé>1­[ ¯\\xjeðwGb»ö7ÜÓµÌpÒa<þ"ð6x<=}_ðC)*i¢vNcYÄhfÆ'(x¢¨É¦U Õí)ôËÈÑ¥DæW©mg¹õ¥µéËÈ	@zù¸£øÖk-·ÔºADÒ¨lM^|'°þxÒ$;Ó×úU|¥«ÎaìMÿr®±ÔI¼4¹éNçA_Ê$SEÌp~éOqþºñ³D}'ÄÖg{­ÔÉ½ßS~¥Ü o7Õ¨z=@àÒÿYôA¥j½²gÌ$wã¡îH|'Ò¹Ó¨gÛ1iÒ$ãïÈOK·­KÁK®¼ãJÅF<Ó­×kÝà@býr}® :<R®bç7ü£×O2¶±ç,Ù\\×ºØ7:ÑÖ0KrZvÒ|À®q§*»McÎE4[3NÏËºKMJ=}ÊÉcå¿5£8=}s²1øÁ.¼PòùeÚÉj|p$nÉ»6{/_¤?¾xò^Þ<M4Ëk=JkÎ¶Æ±,'jsQ@µÀ-ûª®wdrøG8nÿí ¦úÇ*÷4¡®æn?z¾Å>½=@6«£A0ÍQÒ)>Ö"GúÅ"w0&]zÅ	b.¿°õNäö¹Hk"ö2·iSSñÊLÉºà|8Q£;|¼ló½»bÑ­©f9+³POV=MHUWºº!K0<0Pºö|7o£7¸¼stôV¡|´ËMU»n<ðÊLi»ö>xKÎ®R,¤tnÊ\`2»±©Éi"C,ä²;ñ©È"ðùZçO°~®¸TòÍ8xçÃôÏ\`àÎ/Y¹=MT\`.ÈHîÿá=}yÕ_:Q!=MiÐ=ME(í·&b«ibþ®q»"2fâ<µY8Æû=Mð+&b¯iCbþ¸q+Roý^\`Ë]dqË/¸ÚÌbÞ×p-´Í*DÌ1dq?EäËýX¾kUx&Ì{@Q8ÑÐ/LÌEV/)gFX¶zÒ=M=Mï}ÿBÈ÷%Kp7G4²Ù õ=Ma¬XxËÖ\`Ç0ÜpMÕù¡Úp=}Õ63Ö÷ôÍH=@ùÂ	hEø¶]ÃÝ«£ÐZý¦¾ÀH@&½=M=}NyaôC¨%ÇÉëßð³rÒ¨èTûÞyCE¶ð7ð?ðOðF=MT»Ûê¢çèöÂ#ù_¼¤	){ä£ùù@%n¢¢ó¢;ÍfÖi\\Æh ÅçÛ#úk$mö]=@µ/ÅWcÕFGñ1p÷¹Ð=@^þ\`húÓÙdH\\å}góÈlí@ì.çÖ!é?áHBÝ8?!ÀFdÕÒÒØÀÀ!?ÆVø÷Îr\`ÿXVùBriç¥ð\\g@·Å4Éµ¢ñtòä(§q+0ØM§#ÑUÅÕÅDEdôÕøH¥)«+ºïwÄA·gS_CC¹¿7h ÇuDwgF]xPùphEç>Ûæt÷òal\`¬aµëÝ!o#´¸$ð0§{ÁçÕ&nÿª'¶î\\XÇWhèmbY)ónÃs(qýP1´³ñX=@¦»2²%$¥èsrAF<HCG=}E¡©¦l|¼[cc¯9üÎ³^Q?Ý AÁ#¸=@'7`, new Uint8Array(89487));

  var HEAPU8;

  var wasmMemory, buffer;

  function updateGlobalBufferAndViews(b) {
   buffer = b;
   HEAPU8 = new Uint8Array(b);
  }

  function JS_cos(x) {
   return Math.cos(x);
  }

  function JS_exp(x) {
   return Math.exp(x);
  }

  function _emscripten_memcpy_big(dest, src, num) {
   HEAPU8.copyWithin(dest, src, src + num);
  }

  function abortOnCannotGrowMemory(requestedSize) {
   abort("OOM");
  }

  function _emscripten_resize_heap(requestedSize) {
   HEAPU8.length;
   abortOnCannotGrowMemory();
  }

  var asmLibraryArg = {
   "b": JS_cos,
   "a": JS_exp,
   "c": _emscripten_memcpy_big,
   "d": _emscripten_resize_heap
  };

  function initRuntime(asm) {
   asm["f"]();
  }

  var imports = {
   "a": asmLibraryArg
  };

  var _opus_frame_decoder_create, _malloc, _opus_frame_decode_float_deinterleaved, _opus_frame_decoder_destroy, _free;

  WebAssembly.instantiate(Module["wasm"], imports).then(function(output) {
   var asm = output.instance.exports;
   _opus_frame_decoder_create = asm["g"];
   _malloc = asm["h"];
   _opus_frame_decode_float_deinterleaved = asm["i"];
   _opus_frame_decoder_destroy = asm["j"];
   _free = asm["k"];
   wasmMemory = asm["e"];
   updateGlobalBufferAndViews(wasmMemory.buffer);
   initRuntime(asm);
   ready();
  });

  this.ready = new Promise(resolve => {
   ready = resolve;
  }).then(() => {
   this.HEAP = buffer;
   this._malloc = _malloc;
   this._free = _free;
   this._opus_frame_decoder_create = _opus_frame_decoder_create;
   this._opus_frame_decode_float_deinterleaved = _opus_frame_decode_float_deinterleaved;
   this._opus_frame_decoder_destroy = _opus_frame_decoder_destroy;
  });
  }}

  class OpusDecoder {
    constructor(options = {}) {
      // injects dependencies when running as a web worker
      this._isWebWorker = this.constructor.isWebWorker;
      this._WASMAudioDecoderCommon =
        this.constructor.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
      this._EmscriptenWASM = this.constructor.EmscriptenWASM || EmscriptenWASM;

      this._inputPtrSize = (0.12 * 510000) / 8;
      this._outputPtrSize = 120 * 48;
      this._outputChannels = 2;

      this._ready = this._init();
    }

    // injects dependencies when running as a web worker
    async _init() {
      this._common = await this._WASMAudioDecoderCommon.initWASMAudioDecoder.bind(
        this
      )();

      this._decoder = this._common.wasm._opus_frame_decoder_create();
    }

    get ready() {
      return this._ready;
    }

    async reset() {
      this.free();
      await this._init();
    }

    free() {
      this._common.wasm._opus_frame_decoder_destroy(this._decoder);

      this._common.free();
    }

    decodeFrame(opusFrame) {
      if (!(opusFrame instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof opusFrame}`
        );

      this._input.set(opusFrame);

      const samplesDecoded =
        this._common.wasm._opus_frame_decode_float_deinterleaved(
          this._decoder,
          this._inputPtr,
          opusFrame.length,
          this._outputPtr
        );

      return this._WASMAudioDecoderCommon.getDecodedAudio(
        [
          this._output.slice(0, samplesDecoded),
          this._output.slice(samplesDecoded, samplesDecoded * 2),
        ],
        samplesDecoded,
        48000
      );
    }

    decodeFrames(opusFrames) {
      let left = [],
        right = [],
        samples = 0;

      opusFrames.forEach((frame) => {
        const { channelData, samplesDecoded } = this.decodeFrame(frame);

        left.push(channelData[0]);
        right.push(channelData[1]);
        samples += samplesDecoded;
      });

      return this._WASMAudioDecoderCommon.getDecodedAudioConcat(
        [left, right],
        samples,
        48000
      );
    }
  }

  class OpusDecoderWebWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, OpusDecoder, EmscriptenWASM);
    }

    async decodeFrame(data) {
      return this._postToDecoder("decodeFrame", data);
    }

    async decodeFrames(data) {
      return this._postToDecoder("decodeFrames", data);
    }
  }

  exports.OpusDecoder = OpusDecoder;
  exports.OpusDecoderWebWorker = OpusDecoderWebWorker;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
