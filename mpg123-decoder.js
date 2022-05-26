(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var Worker__default = /*#__PURE__*/_interopDefaultLegacy(Worker);

  function WASMAudioDecoderCommon(caller) {
    // setup static methods
    if (!WASMAudioDecoderCommon.concatFloat32) {
      Object.defineProperties(WASMAudioDecoderCommon, {
        concatFloat32: {
          value: (buffers, length) => {
            const ret = new Float32Array(length);

            for (let i = 0, offset = 0; i < buffers.length; i++) {
              ret.set(buffers[i], offset);
              offset += buffers[i].length;
            }

            return ret;
          },
        },

        getDecodedAudio: {
          value: (channelData, samplesDecoded, sampleRate) => {
            return {
              channelData,
              samplesDecoded,
              sampleRate,
            };
          },
        },

        getDecodedAudioMultiChannel: {
          value: (input, channelsDecoded, samplesDecoded, sampleRate) => {
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
          },
        },

        /*
         ******************
         * Compression Code
         ******************
         */

        inflateDynEncodeString: {
          value: (source, dest) => {
            const output = new Uint8Array(source.length);
            const offset = parseInt(source.substring(11, 13), 16);
            const offsetReverse = 256 - offset;

            let escaped = false,
              byteIndex = 0,
              byte;

            for (let i = 13; i < source.length; i++) {
              byte = source.charCodeAt(i);

              if (byte === 61 && !escaped) {
                escaped = true;
                continue;
              }

              if (escaped) {
                escaped = false;
                byte -= 64;
              }

              output[byteIndex++] =
                byte < offset && byte > 0 ? byte + offsetReverse : byte - offset;
            }

            return WASMAudioDecoderCommon.inflate(
              output.subarray(0, byteIndex),
              dest
            );
          },
        },

        inflate: {
          value: (source, dest) => {
            const TINF_OK = 0;
            const TINF_DATA_ERROR = -3;

            const uint8Array = Uint8Array;
            const uint16Array = Uint16Array;

            function Tree() {
              this.t = new uint16Array(16); /* table of code length counts */
              this.trans = new uint16Array(
                288
              ); /* code -> symbol translation table */
            }

            function Data(source, dest) {
              this.s = source;
              this.i = 0;
              this.t = 0;
              this.bitcount = 0;

              this.dest = dest;
              this.destLen = 0;

              this.ltree = new Tree(); /* dynamic length/symbol tree */
              this.dtree = new Tree(); /* dynamic distance tree */
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
                    d.destLen -
                    tinf_read_bits(d, dist_bits[dist], dist_base[dist]);

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
              if (typeof d.dest.slice === "function")
                return d.dest.slice(0, d.destLen);
              else return d.dest.subarray(0, d.destLen);
            }

            return d.dest;
          },
        },
      });
    }

    Object.defineProperty(this, "wasm", {
      enumerable: true,
      get: () => this._wasm,
    });

    this.getOutputChannels = (outputData, channelsDecoded, samplesDecoded) => {
      const output = [];

      for (let i = 0; i < channelsDecoded; i++)
        output.push(
          outputData.slice(
            i * samplesDecoded,
            i * samplesDecoded + samplesDecoded
          )
        );

      return output;
    };

    this.allocateTypedArray = (len, TypedArray) => {
      const ptr = this._wasm._malloc(TypedArray.BYTES_PER_ELEMENT * len);
      this._pointers.add(ptr);

      return {
        ptr: ptr,
        len: len,
        buf: new TypedArray(this._wasm.HEAP, ptr, len),
      };
    };

    this.free = () => {
      for (let i = 0; i < this._pointers.length; i++)
        this._wasm._free(this._pointers[i]);
      this._pointers.clear();
    };

    this._wasm = new caller._EmscriptenWASM(WASMAudioDecoderCommon);
    this._pointers = new Set();

    return this._wasm.ready.then(() => {
      caller._input = this.allocateTypedArray(caller._inputSize, Uint8Array);

      // output buffer
      caller._output = this.allocateTypedArray(
        caller._outputChannels * caller._outputChannelSize,
        Float32Array
      );

      return this;
    });
  }

  class WASMAudioDecoderWorker extends Worker__default["default"] {
    constructor(options, Decoder, EmscriptenWASM) {
      const webworkerSourceCode =
        "'use strict';" +
        // dependencies need to be manually resolved when stringifying this function
        `(${((_options, _Decoder, _WASMAudioDecoderCommon, _EmscriptenWASM) => {
        // We're in a Web Worker
        Object.defineProperties(_Decoder, {
          WASMAudioDecoderCommon: { value: _WASMAudioDecoderCommon },
          EmscriptenWASM: { value: _EmscriptenWASM },
          isWebWorker: { value: true },
        });

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
      )}, ${Decoder.toString()}, ${WASMAudioDecoderCommon.toString()}, ${EmscriptenWASM.toString()})`;

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

  function EmscriptenWASM(WASMAudioDecoderCommon) {

  function out(text) {
   console.log(text);
  }

  function err(text) {
   console.error(text);
  }

  function ready() {}

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

  if (!EmscriptenWASM.compiled) Object.defineProperty(EmscriptenWASM, "compiled", {value: WebAssembly.compile(WASMAudioDecoderCommon.inflateDynEncodeString('dynEncode00ffÛ¼=J{=V|æºæ¨¢Æ!Úqã#úk!&uaIÅ03¼Æ7.GH ì³ñG$EÅpB*J=IpQNêZ{$ÎS0óbmÞeeQG>=H°Ñ5sg®Ê,¼t=gè¼K9Ë3#îîþÞúçGu³Ëâ2=@êë¼õyûÖYþô^þô~¬ßìîº4=Kûâ/¸8=M¦n=Mô&É¥;péåûânäè(ý=J=g5¤Ç04ÄN·6Ûzr7ÈW ±<=gºý©ý¼xÔ7HÙãs7¨ÉüpîÌ$4®zT^³V8iïSÙ±±SG6c(@7=O=LÞ½<ßî:çÞÚÂ=LAý½Òý½*§ïöÜõö<@þáúÂYÖ´¯*çèè=}"[Phóu¬ë=MVÔú¡åO´=g[Vy´Å´­=g`÷ùyIÅ@7Ûv¬¡²ÉÓÃ¤TøDpO=g=I)@~¸é¾y?²Î(ÂÚÁ-)VÁo%)tE9ZwérP¢Ù©¶C@÷rÀo+ç=IÆÚÂÀswj/½6×ý{Ó.=M+k[wÆ.ë·ìô>>õr¶»æÞzêÍÜnÉµm|^µdÊ­6¾ú=îû|ÆÚnýýüÓNýÃÚ}hñü=þÚÝþfPSaÙ¡¬ÐÕ#WÞ®º¡cv#ä¶ôVXr;=LÖØs*%Ús#Àß©³âHhÖêª_#Ó4VªgÅþóµµ>Íkç|R³%=HEJá¥Ñ%2(dÈ­LTvcÓÆôù²p+5D4Q÷(jwvuÍìq#`Õ6ÉO~½ÓoBÏÖ{j¬=L7=JÝãÝñ,Øs"P¨$¿i(wfz2/(ZF¦îKÊ»Eâ½L¡£{w«@HgßÙ§çr<7xH{F"ðÔ6W÷ô@ÏGáÅ6º¡ñsÞÂv!N*T<hþl¸*ììº&F^²~^ªUIvÍþLÞÔéI¡Ä«Ðc~ªóõînôÚ3E6í>;M£4YÎ]7]Hua=Î=K®ÏÏ[Ö­þºÑí»¨b»Üs½=>«ñc^ªª:¡&Ö´=@ö=I=K]@æVOé§Z )=H3sö½êÓOê6N>@yªj3>ØÔi+X¯+hÍª é|¬G8gxt¦¨)ÅYÍj,ÿÈ^º°~*´V±âÀS§3­JÊÂîNÉXdöÈÂh8ênufÌ£;Ý)&tðZØáø¹×ÆIµt-ó×¾êÑ)TTò©©UwW¼µ=K4gÁÒÕ³*^ç×=J&ú#£Ô³3@yþ}jómÑòÆoi)zY¼H¢G¹¨s/($Ü{GùóC¸Vÿä6 =Kt%úöLÑw.þbTÖLF½£=H¤|hR¬cwSÇóïÚóZÔºkûjúÑ}ªö=KiKVL1=´£=}Æ?Ùða&üRSÒ2=M$ÜHÛ¤Hy0=KÝo¾*m91(GcïÊÀR^=@KP±«PÑª«ågù{èJUX$ãßQèHw¥JÈÎ=K=H¸%ìKMÑÌª-Ìì½HýJ=J>ÛdÓ±=K<gDÂáÐ,úZ=LÕ?wr´8*ðÊJg..¬W÷ÃÂ=}àGXªõÓq9£Ð8jIZ yäpUûK÷¥XÀíI¬«2V{ËMbh+©cÈWY=Hû´H¹ä¨4V&ú_NêáH|=[Ú6»ø]ühíÚTÑ±=}1T£ÿÎNL¼[£cHøÇçÅzõ°Ëk´^F¶¶ðf8P£h%Òdi§cb0ô°=}zu·ª=g ì »#Õ=MÏt=HTªÏùÅÁ¯aZÑGó=HÃ,BN?È§üÖ>¥Ð¡Rûç4jËIü(^*HÇdÔLyÔµÂÁnÚ£±ÿYÉiºÞåí=ºÉmåêct!¡°<KL¢ðÄ=g+Òì|¤ð3µ,P´âc´p¼²¨.jõ<5:ü% õ:µ0`=L¤µ`>Æ§ÚeSxPü%$¤P*=IL_^dBG!ã0ÓUCk3$·Ñÿ¸Õ¿ö¯h×%îHèYUy¡ÜâØÞAÈyÍ´Ùëkt;ó4ãêt@µZ­m£pUÙÌúÀ&J=KBLù|;Z>Ùz9~±uöë½¦ë5=IóFíØÆ+6îÊR+%°(¨UPIjRMù)=Hª;L¥ô;Þ£Ìn¥CÞ¦%(Qân=±ý=IIx}¤xÒÖa_!aQ(Ú9uãÞb=Kp®Rè³Ã¹%Z°ÄLrögóÚ§ÐGâÈ9?H¿2Ê7=@ÚO Jvç-Ð¼¡Â6ã¨ÔlÚ}ÎçóôìÌè=g8nYñåêKÇÉÅDXzòÙô:ÊTLç#>6+x:0ÿÎYpÍ3ê{:=gøåÚX´ìàzµ6î]Í¶TÔñß.h+<«~·½§ôWtvhä&¤ºÿ|¹MRG6¤("ÜMõæù`µfq`¥ß8"³DªTbCÚëVX¼5ñÃkOþ¹MÆ6ÝAtûÛÛiã[ÅÙJ:w?Åºå)×¾Ñè7©¨Á5P´þ×ý|Ä3=Im=gØ¹Ô|vªì%%¹SMTéKÙ7¿Ù²ÿ××3]adQ§p%£DÚdk&!(¨±¶gZpÿ5Ó|e^Qßß_gP=Jo4wÌ]³¹Ñ],³ëLJ8=Jì{ì4ÞÃ»jÊ²µônèÇcÜs"æ¬°p¿^ÍÙhaÚe=gÙÔ°ºÎÓíáwÄw¬lÐífnÓUªü]ºûýUHb&öÍ  ×Ð:¸TÅZßÒa³©ó¬â)ð=M¬©=g³§nãP^ìù½VÂ@±8v=K£nË=K²EâÆ^»~{=w¬=K+*=|U=L¥f{YÛ³ªµh&[=È(lÖIìVÓg¯½7ÉV? CÓa&i$Þ~°üv­pC/ë=LVöÐÕaó³¡òUÅÍ48@l²ÙÔÂ>»L&cÒà5çÇý³)Cª%Ô^K*úbýÉ`ÍÙaÚ³¡jzIl*eºn­JJ<Ô#óLÚSôZk©dJÛ»ÉhV9c+äóÃ}%»_æ=LOûªº3}{»ºUDÊ!Õ©{ySxþàpÌ=Ã¬à¬-mç=H±¦Ãä|ÿì<=@Ü¤ufßðYä±m£9$Bäkna5ÎVe%ëÙ´AÁJãè¯Iv=H%M=In=Kiéìgì+5_^ac=I-8×î"õà2»ß¼.,¼ÆñGyü {1¶8êº²~=Lh`fT&(ªÓ:%Ãîbè4=g=LÆÇ±/1±Â~âî"7ÚÀÚ#)A=MåC>P^ÈÆ79Ò4ÀpfÜÊ©PS:Ç²9èrfðW0=Lºòúi:RB=L97=Míò<53£$«³âNÌ~×gßÇûrÈ)1­mfñ@þhùÅÄÚNBì¦4DTé[ê­4ÉÔ¼`lM0¡a5Z Ì,Â=Hrª¥þöø>YÔp=Mê= p|M=}élvýsöò&NýÄÐBÚ*ñÞ2ZoÚçêÊ~ø~bÊ =Lã ñüÛt~zasízÙuÝØ|Nþñ°-Y÷Sâé/Éj£±BA;±¡ÂÚ~ó¿.þÐî~ö¶ýï®½N} àµ~úüöýªeþZ=MlúþÂ=L6Ý÷zù+OÖ¶º Pk=J±¡¼Hï7`ÆÒ=Hùð´^þÃ>Å£Ê_e=JbG½ÿ}ÏFüµFc~q÷>ÝT1±ô§=MØ6=}ûãK×µ =LÚm÷}ª}«wæ»p7(,3ú¾:C=ò=KÞÚ±Ï¼üí&ÀøÑRú~Ø±N¼º¢ýÔDüªùFh_°ýl^k¼uyñªÆ÷ù÷;ÙMS-`òý<V|sT{¤JýØÙWòo¸ød#XÙpñ¦yw?tØâ?2L-t=Jþ?À¨gÙ¹Ë?²å>ÛàsÑ¢ÙÝ!üîM´C¢Ýb¦äÑýõ}yè£=LKðýëÈß&ÃwÍw0¦l¯cC%ÑA¯}÷uþïzñi6=K¦ë4¡6mDøsÇì:d¢4±bìvEFg¯bæ«¿ø×hÍ¤/åSE×°"i=Iz#wýjBéú]»ìõ?Ç¬ÎûJ¥ß¯Þøâ=IØän¢`Æ=M YÎ$M)!¼=MÚ§¨eñâW°¼ØR¶P<4DQëhO3ÅCsëh#·õk~Yº(YêN"¡~Y¾=H=@­<lÛló¦6DúÒåLÐe~¹sRs(<Ú9-e½ÀLE#Ãø¥ DçÂKH«7h#¡b;zU¹qp×C D:£<¶¦ÇçºØu.h¤%¥ÁÒÌµÿÌìzßý&BWlR40}@MôMK±q±Noð=J=JiAÅä^d~­Í]çR,¯ëÍ:­Ñ=MflAXô­Ú#d²©¿`ü[àÃÔû¸y7z­Î=@@tëÇçÄö<Ó×aú¢PnrG=Lj!wûÀs¾BËk#JF;çZô=JÆ1=g»°ÇT1ëÁUD+54·G³Å3_á±âÃ½#p±bõHWZeØ½eËö=MvÃf¶}5×8Åæíb,ÆàwºWUÐ_°ji¸O4Á0=©7=JZÔEQ=}®Ã=H}~-ãÇa&÷ûã=MÞkfx=M@ÁÑýåfÈ=Hýí7««°êè÷]U¥§d_4b×Éàh=S2ÅWN§9óÃÅº%µÄ^Õ¾ªØÑüÚ0ÕBÅ¤§Mð"ùF=}XDþÇÑ¯+d¢+x5ãXä)5·iýì%Lsý¥!ªPL¶Qþ§¥FÔCùd2á¼ù&MI©|8Ò/S®Ô·p3BìÉÂc=HÇÝ}OïH§G÷èJFJGp±h]acGÁÆJ!³Ù^sµ²üä¦"¨²¥ÇòÂò òá8ohÙâï¶qÓÄ ÷¹gÚ­^þÇåæ=}=Jvðê¹÷Ù¾³Ä·=JÆ_×wl~ûÙþÒX Î=J>pÎX¾à6`xçÕµ>ýïÐÞxÆ=£¾ðºÞ}íÇ¾»±û.=L=}­=K~©ð{p½nÑ0 Ëbô@Ú=K=IÂYï%aLY5¯ÎË×¦Ãç=êK¥öç>?(ìéDÙPÑGir#«=Kä`4Áµþ¡¬5¶ôaS³2Z¼]ji°åÚlt±4DZL8á¶8Jë_W_1+0#Ý¡<z®ë¸=L¾~ÿ°Z8Ú±>³43nÏòãÈ¨ª&s!Ï6×=JfÝ/Ðw1=J¢(gÍg4ÞÊ%=J=M¦ÛÀÛW°R%±¢Jx!>Ù$9Þ«dõ°JUõH¨K=J8ºRZ|¾@HnÐòq¶ÈÐ#&çj¸mQÙx-ªv0Û-=JB=Më sIÅo&¢¸tO7úêÅÚ?ûëJHiûevwËtlDÈÎ¤è¿kYÝk2Åêe#Cû[uÌ¥´Ìo¹ü=K>êÒÅkYÜ=KÞ_¨"h}Õ¥Ü²hd2¤%§÷X­Lú6ÂWéù}Ò²eÒ²6Â´ï±¬´Á>5PMðÒ­L5±¤ÕÑróRIVÎ¥fm_ù{MÙfï°&X0¹¨=}ñþÌÐ5ÑU&fË¥L7^çôÍ©=JôÌ¯0=g#ñôXÁÌï9I?|4)Òeh³ÐM¬HfÔ¾ÝÌoL=@ÍIUYÁéÌQ¯)8f5¤Åe(ÒPT0q|¢íëß?:&:ß®ÉõúÂÙk>Ì÷Âª²æ}ÔÍÊôë^²eõ¯>«È½êÕ0rf$úLªò(ó&B²ØäLVÍ¦æÎQÊ=}à(ªåÒ=JeÒôÈØØêNÎeª:r5zÏr#òèHÚæ±; 4]7:]3=MfÎWÒFb5 ñQê$³»aHéLyåw=L¸~ ¦éTdÞkAªx©Î$Sï¸4:¥²èj÷ûgæ»Å3Iëä]È=@@c7HæÑ`$&ò²¢u"|WÊÑÕYYÜE`oþ¢>¬±Ïùf ¸ø³~=M£éEJXLÍã|w-Ltwþ¢«I73÷Uº²Hî=ûªÍ±üÑËl?#õ×]ÝÈÊaL%Ô8ós#®0O©ý`CË>%¸ëXÈørg"ÊKË{YB:y`qõ=gTb×æÒÙ[y%=J&HU%°ÐNzå%Ôßé" =}:}Ìj< <7>Ù=L+áÕìäe]»ü ÙîÍ=@1ßCó`¼µÝÑ³t[/XßÈ=@SbP=Jòÿ£&xÌªX«&ªw©v3{lèo_.>Ä³ÏÓ>×Ðï4T5yÂ,L}ývgÏ»Sª¯S§½1*÷øÐ#4éÃ`.nä¤è´ÎL=g¬)CÄùo°óHûWY«=}¿]9t-¼§2sÉ1ËS¥¼Ü¿=J»)oØIÛl´G?ÎÌ{l²¤ôQqS!ÞYPö¨åJ®â$FTìjU³{·Ój½ÓÑcB1+RM]dÃh°åü©X;¯¼=ÂJÝhÍ¼ìJUÎ Û]òUJ2µ=}¸GøÍH}#ht¿{?4n*iÝÀKSÿ2×­8O,xù5®wTÛÞ×¡¼Ef;pXb"gcìßËèJ=}cÄoøëþÙ{uîQÁkå×ÝöëÙÔwÿâ(H8ÑÕLzMÛe°£Ø;~íJQð·è=Mçà(áÆ¬ªu"ÖÄCN{ÈKù¯|å÷½âº¯ÓG3®Ûo¾âÅ&xxÎÑ5]¡Àu9X»ÚÐ:z¡Ést®=HYô=HBPïw%ª{=KÀ®Í;9*z­y¤¨+É¤[ê¡#ìj×èLÁà¦tuâ¤ª$¹qõHq:vG¬Ù~¸F¥=@º0V!d©X7  ;ëUc¦%*fYinÑò7[9¶­W{XG7VÃ¸ô4û$;O»&=JÓzÚ(âµíÍ¾³YëÿMu+=KývýT=MWÝt°`<(H¨çôÕíp¥Çoªíb_æ6Î:½JSfüI%x.ÕïÉ`p:³Ì%!éÄ»Í¥4=gqª¢¬yX ÌÂÒ%Ø(dþoñãö®^ý~~äÃ»þäìåÐB<òýÖ`¡ÄQµ¾¨È}±Ö«ÐØ3·ûµÞ÷õ¥x ("çBø÷ûä¾ø¿ÌÍÎÌ^ý¢;qsyÊïìFµg`=}ÌÛ;ð7=§ÌÌ=H(¬ÅªæMKÂQ¹1ü_Ï9Æ´=«Qµéõën¥±:a=LrÞÅçîöþ&+²>úÕ~aî4¤Î=Iú=@Û=K`%¦ri}á¶Á0ìüÝâo8ö¡e{æ××Óºq7=@}=}ì¤ÛÕ¬²91Ó j<o7@D*u¨Cb²ÕåæcaC$k3ÿZ:Í»Óªò4/þÞä¢ÞxÊdòÞ÷":«ÊÊþTü÷Ï=ýèZÓÎF>±yÊ+×ÃÿTL£b²HîÛ8gìÐ$b8úIÝ<Âp~¥£úänÙ»f=J¯[ýú®ù.Ë²FØl$=Lp5ýlf±?ç¥^rHÖÛ[L§L¨1àØÿ²(#ÂÏð½Ç­À¸®£)ì|½±-¾óÌ®¸ÎÛNrî´nJº´y¾q15Ì®=I|ä½H,<ÐÝÙÛÎ?¹ÊÑâãêûX4:A<Ø=JÀ÷(2)yíb/¶VhhGLh{N)1iÁè`¡a·322H$WzÜS%ÒI8=¶D522D¶ =gº]¢ µwûç¾Ï£=I¯¸Êm=KåY9ús]õ¾Ê®xó4®¾»öþúòÞeynûv¾±¶65<iR~½UL©ÐÓ95*ÑÀÌ¥Iåfh@÷JìÏªuJh£M`w$=IÚãy)<<ÎËDs]1<}°]kVç÷÷»SFÎFæHæáü:¦L¦ç±Ü4$X]Ã§¹jÈÆzO}òFq;Z_uç=¤=T:õ÷»nËB¥¹[&°ö=M)ÒdÞ%wÕëi3Õ²/¹]#ê@ãüõj_ü"jîÌìÂvWA>õ».JûÖ.=)¥h9ÓÙõdcÕ³Ý]F¤!9í.^D¸ôü»¡ÝÈ:à¯°=LwÙÉ:iµ=LGË=M£ØâQzÌãõmÃb±¹[þ®b&«0Ü=@¹Ðl`1^ê5`9YN° JiTÒ=JÂª¿%m6ºÁ}ÊKµ(cÑªÈµx¼ÊG=JóC4+t!{Êôbn7-ú*¶Q$eÛ$Ii5Y0»ËÉ¢âáµ¹»¹»ó¨Ê$tt8X==]A=­®§Ê¨1VF=gø&t¸¨¢µG·Øg¨z­_7ÿ¢¤5Yd¶ÐÉE­ç3B2_Ò59FS±vY2z)ÅW-:õîòqt?jH¡*­GáL-n=@_R³Çá¥³Ú=LqÇÁkY+E}/p}³¨Nf)¨¿æº¥µÐ]P~zE0DÖ²XÈå;ºÌ+/óHgâ|AónjA96ÙZ:¸ÐôXî¤(rëÆ÷Y¶Ü?²PÉQ/Èõ4SÃGUæoå7ò¶ò=L&_t=JÀ=HC¦ßX&ÁÒàC=HØìlÏM·%Ü´ÝÒØì:è®y¢Àè=gV¸uÌý$)Ö¾Ì¤è©lv<ðøZ6ýË6¹÷tòä=JÄÒî-³UÑõ©c¤Q­»äðÉl>ú2ÞýoòùÆ,»=MS[øAü+­{¿+ÃÛe¿kmÙYN¶÷wqùâ#ctÚsÙªu>Í&+¹¿ìU<wÄç±ÄâØÏ¬=KT ÈîÌm@PÀ|® rL5¦9 ]Ò>²bW¼º8XGCYÇÒ=Ê7wn=gdÅ¦éHmA!=KÛ-¸y¨=}éôî)=Kà× âwjº¥ÕIlØ³¥6_íº¿=g¡etb¢_(3¸%ÐLAqØI´L¢ÚÌ±Ã¿Lnc =Jl=Lcpb=@]ÈU""ªh¬©n]ÿ+Kce[Ü¨ÌÉØWÜu½*ô.øµÊ=M¤ªÍÙ©s=K°8j{9lfû+¡ñÇhsW¢¤´v{¤ù¸CB¦P[«CÉSS{kÊ äÈ0Ù7Ú0Zs|ùýÕÉ[ÿ<ÓÔÊ@0O×_Ë[`hÂõÜ-å=Hm1IùuÚ=}ïth=H¹Å§¤=KÛ-£ªrSÈÊ¨Ûv"ê¹r/;+;°äÜ9À´£ñÓ¬Í¨¢­jh1NÙÕJrØe l@Õ3ÆDyÏ«7à^¡¬ÈøÃóçÇêÑ=L°G=IÄ~<ÄÁIO&õÑ^ g¥ÙõÈIÅÊùQ:OsËún¶9ÆpQ°gv1^y)¡[ÜD=}!`¦Ïö¨õ¹½M/µ!1ù`¨yà1=@hä·£$å¸²vãp2ø³=IÑmäªÇ=Hy«rÈ±i3(êïój(Ý*^2"ZWVÅ¹ÄÇÝl=}ÝÈwh¤Ð¦:ÕJ¼ðÿE=K£y W ¥?Æ 5SeæÜWôIr¤U¤GOËçeÂùÝËØB80ZFÆ§=@»(ÉW2´)¦Ï@=LÌ@uáÏæ@¡°$rÓÿG}t$³4¦º+Kçl8Zl«+ÍÏÎCO­çÙÊ:#_3 âMôDä=J¯Åv&*>ÉæÅ¯é+²²G=@ÔQÜEDý[EMB-WHÞ¿G 9q¶ÅÞ3¢(ñÖÄ=JA´,ÂØ:vRsáª¯FeyÁe|ëBo:/ûñôº¶¥@^n¥TB4VlJ¤É÷ÆþïXEe¦5¬ÐGó×¼ôL_/ã)ìë ñvI¬£<áÛmy9Rd6$pöGPG*Â«ÌYÕÀÏ&»ðÌNÒîÖQI¨x¥(«8Ow¯:©æé;ty÷7å$ëÓd[lN^+0ýDZð=IÊc ¶ò!E.=M°ÇÑ¨4üzðÙoÅøævÝ¢¡ÚödªCÆ}XzÍ³^@6òÊÔf½¨f=göLl=gfsýÚòØ$¿ù^Áå¤ªnÃ°x@õ1xðëX*nCeOQ=@Hÿ`yL I¥ô=ppT%íÀµ b!QËÚ8¯Ü÷Z£6-¾Ý=Jg¨fÍ·¡.×²ùs0êÿ¼#á@9ý=LÂÚãÒvPr=gTçÓgH"¦}ætÆÀ ÈªkKL=÷±`Kz=@È:3pl0ËDÎër?¥b|5ìÎ¸¨MÇÌªnöÒeûcÞÊè,ï­÷°y=sßÝïç@tò¿îjvÌ/cú¯Ê;{nçñeÔì¨HÅ²/B¨PÉ¥çbUk=@b-^¬Èð[§3vNÍ=}éã1¡áipUuRoó`2ÿAíR|Fºáà1%=LA m6z;ìpM0=ã54´¢ó0qsOóÞûe=}`bªrÌÀ&ü|¥>~þCý=fnNø¦çÍrÛ¦öûÚ»~Z/<Bü×=M*Çè=M©× Ì=JoÆbóeíÎ=H©}§-"Ðr^ÊPßçÎMä¶øÅ*29ÿ}×¹6ò£eá¿=HØ9øâ°Æüù§|N©Ðåd5TÄ=K°r.ÍO52äu¼Ø>æ¶+õYmË¬ÉÖ¼ó¹rlÅJµ÷bØþ¶6F=gv=@ýWõïbÈê{;·TÃ×Õ=}{=epPÿsE`3&¥/Öì¿|=å]ÝÇ2ú±Eø¹6QÊÝúÉ=H÷^È×T=MÐwQ­9ôööÑE,Abõ=M7EûÌ~XÝä¸ü`÷ªkÐ1h½]ÅµËdjnùö~Øeõ³RCÅ]³8Dúu@MkÕÙØ:ï=Jÿ½mUÜrMÂÕ6åwC?îÔ¡qm=gîbbà;ÎèZw0c]ò6§Ø9Co5®¡fqÕì^=@T=;ÌO Â(Cqu2fÈd8{%PL0¶ØÅåøf5ýªéñ.1 =Ksî{u=H${×=Hb=L¼ S¯Þ.Ã;;ñà$ä:õ(Ýã¹;Zyg]Å¦ÆÏê_å±eRÍ#Ni»¥ý~cúë¬8É¾j3Ý*]I?ÅlYÂÂ9õÂ°©Û/v`ÃS;Ë¯:ÚJ{ÜPèåä@ZrÅüAo§V< Ï|ýÛW=WSndÛõPôLg¥79ùÊÅM«£qi¸7êÕ¨¼:ïÞ¸¾¸%0døP[*=À$E§NqçáK·Ý;]ÅFpõ1d§@£íÅQz$Ì`Ï¨®¿dL®0OëK S]ÀÕîbe­áO2K@ÚÐèÅ6Bõ%÷ÏÃZ°ØðaÂ.ÁD¯® 1óÅS7kk°Ô«t;Ûjyð*E]Ä¶0­Åy¥%â­¢¤=@³"z4(¸zRrl~ØlÄß|=Lç82<=g:Â¼ÕýñlxÐÇÄ©¡fe$6RÒ5ýBo°kf7ÉEÝtÀrbJÕ;Üy±ç_Üé±Öµv ­w&BUÅ·6Ãèp×|xi3Ë»TdGX((g7kÝ=M>2xq5d^¼=HF":KfeKµ­2±XÇúðbÐ0¨t;IÜMìÑ2Óæ7*=g^½rþ8yu6Ë±Ç«YôÚ[Ìîïnò*q9ò£ÖgOÅ<y+.oJÙdl=}ïb>iG9!¼øIÕNRë¬w=HÄ/÷È|#ÜrW<hÚí,ë9=1]H4Îe9$º#WHHmw<ã7æMa½ð%sÎáß_·^=K³V»Hë£?éÍ2+T=LS8g1ÌÑJþ¹Yt-¬ìn[Õýen~¢sºâw`¯Óµ;=JtäÛåÿ_ôªw3S=Kgß¸³yÐ;±|¡ÊáeIbÈfé-ÂÄÈ÷Ü,=MÉ=Mdê1O=gVpÌVàà]2 S<î%àvÕ:=KrIcÄ!¡×I0ÐJÛjZÔÁ1ëØµ`Hà¥SJ6-ATÄwbG÷pGk¢t=gØÚ°üÜBÝ#ÌÌ¯ú}U2nÈÙc§=I³4ñ,"·Ðy_¼ì·b«fæ>¶Úó=H"ÉÕ÷~ù¡éó=gÆpëV#í^#Ð]P¥nxß²;o=Kq»ÒºÃÐºòìþï½~mß½Ä¿0=LxÃÒCj}fã=}l|J»nú]!KðÕú¢Ê³ï/Âäòo0.U|nf÷ýnÅýt^×âü«ö×­ÚÕy<0vûâº+u=KÁ!ä¾SïUËù®ê£ßö Á]·ûB~ü×ý2Õ¬c_+D¡3Ù*N§k=@Lå@ërëFL¬£ÓwHýÝsMã2±,³w&wN²äxs¨à(ÉZù=HÚç+úFXQõ÷<µ»ëðRÊ=}ó!dÉä¼ê=gþVÓ¡÷@*m u9ùÁèC¡9(´að¨Yã.-ÞpQQ[ÈÈ¡<Ç½Ç´3o]PDsz#Dz=Ù=K³)­Ç@0%ÒÀÐn|:×õ*Å£2¶yóuÑSêË)éTÕ=K1fÏ¡à3ñ­5Tf±¾¯Pv`tö¦R×H®ßj]ÜcHÖÏ¾Jk&ÖTÃùÀS7±O>Bßû=J=};¬}=}=KK`Û«á>}0¶%¡*û­ñ=}ß ã+ßÃí°B;Y!Ø!ÿ(v¶ÆöS cÄ=@9ÆýYävb4_E ÂÈØ«f×Rú¿P$H¾¥pS·¥ú=@ÿúª`Yh~V)óNHl=@¨1ïÇ>ëh|®Õ¿­ØÖYìûÕìQü8=MF^r@×j+wß6ÂnuÈá«?~0¶¤Ä «ç¢Þo]ÖÅ¹meÚtô©­¿Máð°òy9d?X; ð==K8O[!ùäÛ4õÀb{oÌ¼oÙâ¼¦kÐK§òÃ}¿íj^=JÞIÄÁ1*[lîsGß¦¼Yo=}Y3IH¹³iÃxµ¸êàEøàÞÉUa®wçp¤ÁPa?§zÅfÕås/k°;/GIË8»ìq|7âù`]!=L«I³8Ø#=@UVDsüïC]i0ëÒamxw=g¶á$·bÄð¦Ü¡º/ó0õ=Md|ÍÀÃÀ»Ík_ü[;áMwjÌR¯|¿ÃWb#ãüÐ;¶s74ÇTõTuåTw6ßÈNÅµ66ºËpòúêKHwª§ðüÏÎö#*Í=°NôùX.,ÈÙÆ=Möt?K-2òáJâÛkU`OÉêÜl=HÛÃ¡_ý«±P-a6=MÇ#uÃpÚRã5Fãû`¶Ã¸Æ$RGWºÆ%¸OI³ì¡ÂÀ»zVö4áo÷¬[>B/§¯¬Ü"êVLcæóAþt&v£Ì?Eµ#g»G*¢#BØ7ú_ÈÍî"Õ34¬ðÆ¸â2=Òô(¸¶GB¤2ÔªIÏXÉÍÇÍØ=}+zÏê¢=LcÊCµdú¯úºEÉ»)ì×|¹õï}°õ7ý.h~ýäì`-ÓÐ]ídØ7×0r»VfW7Ðh×èY´Ð «µTT=M{¶KRÍ¹åNð#__d1ðf{»Vd*-¯ñrå=gejUÍÌÃnÈ7üÏp9ÚwçÓlØÝÇÊ3iZxÄ=LGÐQÓ©ÄZ8¬_+NpÐYFôÔXàÈkçPpç·yI¥"Î´JãÜ-jÝ=©{k$¶8/Dó ÒòBdh°´S"=gyÄCËI=}ô¤rO¿dHabjxõÎ1Ð3ñÀ&èrÊB ¬=}5ÜrØ0þ×dU]6{ %ÄÚß|Oî4Ý<OÝ1£åË|ðÕ=g(OÑ³Yflp·ÊñÕcªÔÓ¸³=Ka_° ðnvTÜÁÙú¤Ä[¡=M=@;Ø+B¶dO¦!wíÄaÿÔ->³ZÍè8®w;A#ËcbÃ$P3Tº=J7äifÜmÙWÉ¶¾ÅE|&=g=LvÑ=MÞÑ_2þ¦UµÐ*J=g§;wd¬2qñéã-Ãé:_V8àWÈìTÝ^õ¹Ý]äûb®ñhôÈ=JÌÁë<Uô£Ãû°£ãä9þSðNLòÉ>Üåsæl¢ø+äu÷&æÆ¾Pýèþ#òQÝEË`=gþoI+ï¢l>ø¦:ûuyÝ5ÊMýh|±¹AÛ=MÄã>âx=MuEÐÉå^m=g©´NÕaýhv=@|¹×ßË>=RsÀ=}tZîñN:Ú¦ô5%ø¦)Ê=}¬°Ë>ºÎæJ|kÒ`ÜnïKõ¾¤#÷$=HÒ~Úë2%D3a=M=M=IdJ­5$±È¥K0Tÿ.=IÈ=J»8F¹Gÿ½ºÖ=Idi»Ã,äµ÷ 4øVs©õÐDOî?Ð/LMEÿÖÚ½ÓÚ"°úP{GVRóJïêTK¡²ÈëôBgü¿È(=J=IÐèJacü=MØ»£¸@å/MMõBàÝSäBÎÃÓ÷dp²PPØn~ÔáFñ÷w ÷øIðï0*Ä^ÝÏ|Ñ=H(òÀûÀµ+dÀÓDC=Jã°Ãú=Iðùñ´ûD¯¢£¿i=K=Jeú:¤*Y^¯ÙçÄ"QýñäÚÄ®äoíÞ¿3ôl|½ÑÓñÆI:H"ë¼#ý£Ôõ=Ý¤µ=IL44|öj=@étKeÖkû¼]g¥&3Ûsây×¶6öÍjúâ|ýCqÆA¬ãÛzP-öT?}á]Å±b3F@¸KÊ¾DÛÛ¼ÖÉæ¸(Mr·Å=JW=}ñNyï¦pVl»©ðzeº¼Î<zðTÄÔxÐæ4öÖ»àZÚ6µ¦oÄêUmCl®ÄµÒ«¤¸^fV5îå¤µÚ)µ}ÌÁØ^ICv®¸îÕ²øøØÉÚGÝºqë-Î,íEçN©@æ=M±¸çeÈßS0¡¶£Zr^Hv>í,[6,ÌÜú=IÚ9º¹f5ÈDZJrvW¨Ë°¬Ä¦Ïµbr=J©MçQöq¶X·Ë²]R/FlE<ÙÀËÉ=MEõ÷Ò®½â}øÐYj¼0/%ÏÈ©ª<"s|h¹Ê²NÉÁè%=LµË¿UË$n@óæ"]fp¥T¶ ]nÁWÒùw=J~Tßgwän³÷Û&tlí *_ã~._Æÿ^o=I]`L­z-qÈjñó°Yb£Â/Y%ÞºC}Ã­b®²²=}¯=@]nÂ©mÚ×ÑfÅÝ¶Ð_°éÜ9pqqz¼=gp¹ÁUTÄÏOBKª$Ø¿â]ÎÆj]®%ÓÙ;Ì)å5+Æt,àaÛÚýàvaW{Û(¢û)º77zÐ·$²,³æÈ|fó5çZ°°ÓÜ4&¤a=}ãFð´ÑåÝÜ÷ýgäs£Â&|¸ýÓ4æ%ß+¤l,ëö|BÃ8w[eWGØ P Õð&E¹`Ø½¿·bTªöKÉ%?øî¯3>p-O=Hõ$×oGé9m=J $¢NêW.ù=I²zLMªÚ_¶yÈ¿?Òq:aÖ½²4©µ(ÚhÒÉa/Ü&¯m}¯þÁY3¬JoAÔ×«ºv%*ëÞÇ/$èÊ²þÅäñ02/¸}|®$Å=M¿Ç­=KêtEÓ=H=gàØò®d?$è`Ò0Bgkg¾ú,û²d*ißTåµÛEfS¢º=I·ÜÂtWxCmDÝp·:Dv LØ2bG½ÊwX× NF=JB=M:­¡æ÷sàUDËÇ=H²Á@©ÆbÆ=@DæUUáË-ãðCñ¨ãG-ÕI=MÍôéNö (;ÃE¸_²MÜ^?BX5ÚüX¼Z¨*=}´£¿¸/3òcú¼/«O>FrSL=K =JZÏôqLÍwRjiªºÜÿË0ÒgÁa´iÕ#j=M×Øx7>.è¥»=}KD^3=K_aB¯AØU×hô=M$Ó%ì_2Éõùç/åA!ËñùqGxñ¹¥f|lX^.=IÐ¡YÑafrRÑæõá´ýÉU=J+ì´Ågêx]´Ídx=IüV¼lþdh±: à-5uíJy1ûµ@áÔ3áÊÈ;Ý¬×éO¹=I»ø%>i{VÂ«§@sÐË=LÖ~N³OD¦=AüÊ=HJO~z=Hô¾¡$Új=Hô¾$c§@Ca¯EYwöf$¡ö«Éqÿ1çïh¹1·»*#+èÉ_º*.ØZL/OÁdlvõìz!r·=}*8tÁyÊW+ÈyC¦ÞæäèGR­]JÕ©Ã1(ÓÉM¨æT¦ÄE+ËF ¡}=KèÐøÀÆè5äþ«p(~7ÒØo7§$hi]4raà°eÄ´ 91`óÏ¡-öËö«£ê*ve2N²okºÊ=}Xëq×ßhÒMUëa*,éÆþyº,Ju1Ø§-ØÈçÕZ-=LÿÐW&t1Ò =@LÁÿã9ó!ºw+Ú¢­_6É`çq,Î¶a]qQåÒlTi­eÏÝ#94§dúPÚq©=Mw¼=KT{P©ýÎ¡ÀBåqs `=H¹î=®=çA3æBÄ¸óxªyÇì®ÙÌR¨Pü¾dÙ§}YS>,=@©:=@)O%&Õ©H÷*!>ÊÐLwÅ°ÄÆãdÇòè£¹{?GW1ÁféJGò8©wÄ·=HoçsÃW80](#^Ø`«ÝUç}¢=ÐY»=HÆz.^µá9Ì9¤õà4ÅÑ´ÞËòÉÐ¬+¬Òmx~"²òZu4!ôuË¨¿v=Jcqód´Òl§ÜÌï4)Øt=KqFÇxá_¸Fìòÿ£ÔÅ=@Kìõm÷ÏÜ"£WªÆòfÄá­U}«ÉÏZpp+ªpa×(A|ÃmbÞTÃÜ®¯n ûqÅ¢¨åêu¸á¥!møö. Püó=Mµ<DE±¡EÆq×ÕîHéº!úÖõÇ*EÔäÀqÄCá¥=@xëâ ­¡ÓÕ¬-¹¤Ê=@994ý&ëFÑvÁSé¨ë/ÈLB k»Á+Oå,J`ÑÜ=gKñß+_!ÀSØ¿=KoWpÛrÄ=CÚ/tVk[lL±ü`å*£lÆò=IÛvi6_C!J:Æ±1l¥èÏwÎ:²ÉÍ¤b.nÜ@]Úc^=IèÄf=@rõ+GCÎAîÎAnF°c±v¾ç+G¦ö×9©=gåÿ¢ÍñÊÀ(¶¥MXãoõ»7<oaho5}ÿ7`c=LÍyív`}àJà{ä³=Kª:0§ª^Ë=}â³ouü/ßû `ù¿(f:6Öþà£`ß~9ÑÚV[¯«=g:=LKßc­î½ÌÆ¾ÂºPíCÇkà°ÉÁ#gvµïDá`æsÚÝ­úÛ»´=L¶iauÉMaÈHL=@¯x:y=gw)ÅÙû7ÊåÝMrýE»ÆA~ãÀÙ­=Jna¡¬»a)lw¤IÚ4´yÄ¢¤mö§Nyoî¨WÑäBÇÜê¦¿±£Ú-IWdë%¥ºÌ9S5(=ºmx¯<¦Âá-pÅ/ÐD@.H½+oØ³ë%·ãXâQ=MåUrAW|×EâÈR*ø÷*9O§"þ=gºLÊeMéEòì|à3#n&¦=gù©dÃÈÑññ×ÆÀN®ëJ6ÑÒðÒUvìÙk;¹Ü¼¯ªXîmelÐ6~ýEº3ÈßëAÝ«jÁÉÜÜ=©¬¥ËÎáçim1DjÇj`äºy1ò9v[ÓKhB>×^DD6¹äÙ=Z¹ãFd=@ñ»Ón¹F­L3 ðD@îuââ-¢ìÀpd0NEö=I*%ÔÂkt(½=@ð¼ëá²¾£>Qó[2ëö}yöß/¯~=Jcff¿=Lr8Û³Z"zZå¨âåIÜS óq=KFIæÌ·,-¼]yn$¦=HJD=JÂôîpTex7üàº#´½ü+p`9BÓÚ ð<97;zÅÔybAÄ·>É|xN¾J:Ü)=g4DV}Ü¾=HºK¬ÍèåP¹Ödytz1%Ô?CòA]Ì=K<¢ß%rÿ×då_=»ôâhûâôU.L <uì)P¿[«éÓ>IâÑd]Úp]ÊÙ¬=J9³i ³=L@0ÅÜ¯=gµ¼¦{eý+Rº§äé¨¸ì¢Ð~¾²å-þ÷5ù=}T`z=}¨¦ÚÝñ^züZ®¨n4ø!-}×DÊÎkÈý,-ÙÀB7Nøí¶Éì#»^^IJ0²Úí9ÉÑåAi¤µt@-m ïöÉÕBö¶J¶Ò§å}IÜ~Ì*ª=LÏtéé$­giWÛõvn»á©¨>#IÖºûûÛTöûök"í×þxòí>Ðâ´®ýßô6ÙÌÚMýåÎ>ø¨ZÓbûYüöí;G*=Jl/ìá©iÐ¸Ù°£yþüc³i·} 2~µþ qõ«=õÜ~þµæâÖ~¼ý~ºDÖBüæï&N[s`ÀST{Á½ÐuR0è,vªÏrT=¥èu½úñüH°èUEÐ?¡U^ò=K$Ç¯®ã°¾ëpÍ"=³ì[ï­6«÷ï¤¹)!»þ=IÆÄ1¸´JcfíúÜ|$=H%Gxù°î=@ÆÊXív(¦=ÎUæ5+¸qQv=HLMUuIlh =L=@¯H§ôq±Î#U=J]äÙÌ °$+fÏ¨$X=g§HªCä«ØüiFîNÂÎ_¿ß}BFÇÊ.ûjÑGª/eÚÞ¼í^TJät:>ØüõI÷3]/Ë°úOl",ý¶ì÷&Þôr»Êº½2ýÄÞÊ=}òçâÇùþöÛÞº¨^·1öÆVíûëº¸¸jÚd6é¾Þ"ôý3ÑìøQ;µïp²ò.ÜN¹)>³ÿ#ì:ÅQ-±8`=LArkÛ§R¥á)-{¬Ø=qF")ÕÔ2Z*©wJ|OB:|;½iWYSOá@ï!÷·lÈlÇ^Aëu¥vé1¶:&øi:ÃêÛù/Ã8§ødu4òæµOXÁüBÔB=)Ãcþ­Á¿Õ5¶ÁºG2^`Ô@k*·AqÊöY=Jþa«¯¤dÜvNúñ¦õÿÊ{Û¯ÚóÜÅíÆ¿®û; QãO[¡òVÄ%ãt~ýYQü«Ç^*yLhb%N_vQõæñéyû«ÂÿvI³ûb2îNm=9Mð»áì4OZwª=IÆ|0¿Ë=Kñ=K*4aI|JÃ¯Üõ7Â¨?¶F])ÁAÙ=}Þ¬§vbõ{xÉ¾ß½`æÍ«Óûìë¯=Jñ¦æM¯bÞú$º¤Ç=Lë"%uÝø=Hi¨0[ul%=@LEöp@ý=<sbhQs°x5:·# =Iq2=Jíi:[Ð~=JXm[·yP[£:·a$e1úµ¦<·=KG O8=IÂð dëgÝM=JÃ¢Ãø2êkÊ>ðæÃpXq»çU=J¥UÉîÿTÏ=I®²^FÜ%Û7LÌÆ»ån!#8¤e=}=I-j««yÿõé`Hi }§w×xZX<êÎ=¡&=L²}=Iáé*ÇAv|ÜñGÐ­;8v^=@Q^À3çÍËuÄÓ±À7þÄ@BÊ Õj-CåOÂðæ²:vºJâÊ¾Oyôs|)ÙZÛi×cÁLýW#"ªèA·Þv³YýHÆ¢rË×P õ=K´äëÏ²Ëe>ãé¸÷D=M<}`ÍÌV%Ë}R"Ædñ=@ò76@òIþqäG¥³©R¦ðµwÀ1Üû±:ù³«MÒ!í©¡È©2=L}ÛM3ß<JEïc{¼ÑÉm=@=L?j¬òeßúiG£ïÃ?+Ô¯GÃ½Yr½WÑåc@-|uþóJ=IèÑÃ xµ=@h=K{Tq`w!*å0°i}ñ¾=}÷x³ú¯ªºFiüü¾0ZõS³=KÊúCäÐw²WÊýñèº>]ð4ÉÍ½-þtì°=Jâð]Ð;NÄ?º³ôÄjl"dræk01§=KDôä=H6Jä;¡ÞõVlcæo¿öàS>,9¨­nv-ë©==}È8{=I)=}Óàªäïç¨Ô3i^ÌIí°åÔå·nÝh:Û+¥Ï­Ç·Ïb8·l÷,1dÔhTü¡S-5IUh;¶FÛð=H)YfñÕTK§¶ÃTQä¡¢áluKtz¸ßÆEËnqÏcRL¶eÆ^ºúOX=K*ó1V=K|Ì%÷Xû=}¶NÃ×_?÷<å8Ã`(Ãn½<h«,ÑÍ¿=@Gç^"÷¦¾ñØ^-Eø*Ï¾GúMhÎnE²4aM¬ñÎýÙ¼þØZ(:-¬Y5g¹öYµEqëïDòç¶£±w4ªÒ+"¡Yæ]¥íãCñ^w·õ¸ø/O3DÙ=JÆT*êû=K=gF[÷U¦¬Za=IjÖWÅûÕ=K`íW±I§-mUÑ"ì6Ï}¨2(?¡YS_¢=meçÓðÈUeþÛ=L«ÐFÓ5$RÃ¶Ý­k´þ©äçÈrÁ%®)7aM¤=}!¶éSµ¤2CLÊ-Ò¹·ß=J$æX=Kí)8nsÎôétM­ð;ó5e0+¨Ö8-Á$¸û%Ú"¦PÈ.;DbÎsò=H©¼"Ð¤h»3¼bG·Úl"´¦ì=L¦ôøÆÿùÜ-iHJ¹7ÓoFÐç1R=}Å5! ´^{ÿ*»¼^96Xí`3{¯:8U_ ÍèÅÞ·9°îÓ9üjò§A;"M0ú[hnê¡jeE¸)éÉ¸aT=K2®Ã;W=gZ%èâìçuatt¡¥vÉwÇ¡l<¾z²KX»sH»MryHy=@Z£V=Ë5Ú=IóèE0$HEYëU"M;+FW rÀÔÄÐ&»d.M¶g4úÖÄ¶7úºÿH¬Õ äû=}×=H«Ç¨¡¥Ï²nØb7[[J7bèÇ<¤Fª=9ÕK Lx¦W"±dÚÉúæyÙÂÏ³Páãwé:®=}aM)8ñüê"ÅÆóIÎõ%4üHòÄ0ßt©O|Ï6.V´ ÑÖxn_»ÊÆ=g´3ò=Lø²¶¡·´-|¬(½p@az¨/pîÊ¿LP=K=M+ãI_Ý6=I:m£ë¹ÜÙêÝÑÏ¹=HÂ­"ÝãfÕb+UiôrÅwØäv(º]<Ç½ïÞ}ÿ( JZ¨=Hlç}säPç6Þ¤¯²Núä#âÕfw¤=}J¦Õg½¬°¢ Ë=Nñdv!¯5=M!Ëú@ëp©Âr²È`Rm5ê¤D!Þus­^à}ÂYpû:=J÷=¬·ò7Vbß­ÒÜ4feFÕ²aÍCð>¶=MbÄGÁÄëÚtgÎÉVíñÌaD¾óº8½6`T×D¹ÐZë­â-ÔNLX¼6ªÒS?0xTQË<T4á,A=MfûÀ#%¥V±`q±´À!ùIÑKS²rl6oÏÍvlÉ¸«Ù/â=KÎÜ=M(w¤ÿYÃÐº·©ÿIDì£ on¹ïH}T±ùy6ÈPáîloPA/¶q5"Ë5f=ÙPµ±n·=Hº¸W|-)$¯ÚøÔXñªd~¡3½páCSdk=}Ëõç#Ñío¡ý=ðl,±Ô¼a¬é~cR/7ÛPõ=HàÈ}#E½nH²jY$m"¥#%*T=@¢E(¥/ùk/ÝúùQþ*¹÷.Õ-ÝüüùÖQ(=gºAÎWëbCSI9¸h#±¦hkÕêÇïì!ñÎÊ,ÍÈÐ]u5=Iÿì¢eLo»ãoÝáyéJ_tîÌ~éì ^õmåv"´ú=H² xÄzùîè±m+>3V¸6È,Ñ´XÂ¹é¦ÜeÝ5v=J¬páW³X²Oµù>¹ýåzÉÚ#þ¹$l5ÉõZy¨Ð§LÒMÎ)Vö_ûM¿µb=I!§³ßú·(82¾ïJ¯¼Õ9}0i¬ÞîêdlÊ>cÆ¬òøv J$/ç=}7=H ¸=>ùa=HæpÌÉþN¾mÖoàF kÉï¸ä|ð(ÏI½S´ÍgQ°gÌ×ãêÆÕÚlíÈ-²ß~ÄôÀÉ×æ{ÉÈ(rbmN¯©­çPãÄð3=g}z=I@ýæÕïß;4f]r¿=KÈì:_qQFÐa]Ê¼H!ìîëf%?9+0èBpPJÄ^xhìa=JP«Þdr}F¥}>=gkc=¶"ìkhFÑÚzaºÅk°=LûS?ù±u·?F Ü`ÅFtða¶J(D`qÕ Wa=LïýS=@p±,Û)²)1"¼«=@»Ð­­ë.ð«a&jtøA:{]=g-»ºhÁÉh£´Í¡Ae~ô)É]Ê=}1YüpÒjóv«Ôª["¢j;éà_ ·¥=Iò8Í´B.=}n M=H"Äa9=J=ÄxxÈmN¶·oò¦!Xã%¾wªÕ±#ÃµT+9^,leå£6B«§§§é9j©Óø²~»?¯²ßF%æJÐ^1ÛJìöYãPßÔI5Y¦Þø¤ï?¡¤áñ7ÓÃgY¬=J+§=LéGê;ò)ÈNï;ÿâ_["¥E³jÿÇ{X=K³÷åq©²FÄPµåªNQõM§ËCÜ¢=IÓl=MÓi6úuEö#æïkn=I MÅ=gÙ¬³bÞ³¨UÛ9¥¸ÿ=SK¬è;§ÖPUØc=gú#ÁSìs8z¥TYLd~±ºgOü}ÐqÌLé!Q;9Ì»)hpù®Dg¹1ÏÏ¿ù´7í»=g(8-ÆaÝq:µËº¤=zâ-µ}ÜÖh2<=K<·v3`U#)1eú©`ûµ·v÷ÇZ#ªûÄ º¹8EB²-ÝrÞ´¹jòÉ¢­p«+§ÙzU3=@=IÎ¤k5«Îï¤Ö¹÷æ6=@«ªÅ!¬jýwÁ$W´ÕÇ/i/à¬û*ñp!µ®íÓî^æ!åoo°ÃÁ0ßñ{©«©!´y]q  cS¯Beh{fTÝ=I(ß¡În]G<Í*TX]³Ip=K°IF;K¤;à%Æ¡[CÉW!0YdÆrsj""¡/Y0cZù=ò¹Ëû_qÀ$ÏÀcC %=gJy2·-ÑFÇOê»m+ÌM¾IÅtÿú|=I$V%ªìÄ»·Úá¹-àÃä.¢æ°+ @¥!=E;Ìeáä£¹Ã5TÙuëlöo<ÄÇÝ=J=j$iòÿNËxÙLIXüizLÑ(z`æ£?»0V?%¦¬+£æù£=J^Àë©¦3rÞå¨×Z2=K=K7~çó@í=@±ÍÉJL­½m±Ãê¸£XÏê=}ígeº=ZÆÎÖ>µU»ñlW|Òx¿¹Il`°N1»æ°ëºKX6Z=K^Çïîø$%à=J:ÇïôË/xIÁíHÏ(¬EÁd­íÅ|Qo}¯á6uß¾+BCÌD¡v¬Jùc=I²»1:ú¢cä`=LnÁ¼+5`ùÃÆ¨@9{¢ÔÖÔú¡æ+öÔÅë=LdR¶HÍR_æDgWlÙkpÒaê9,Vß+n½¦ú­¶²¢ðæh>=@kÐy:Ù,«PÅR¯Dyóu"qé&üµe§}ª=Hþ9PÍ=MÉÜ+m=M}ÆokªÚÌWi¬ª»ÄÃv×{óVc¹ø=JRÓ$tdüõ]YÜ!JDCç%Ô^º$FEýð÷î.«èÑßjÓ0¢ÊTãYÛ¡ÉãiCq´[¹sÌWpñh+akÃFÇ®°Góq[¿§!=@ÂsØ]£=H=KÒVh4Æ6lfl°l$1DÚ¬õ®Áâ½>Ùª/wNþ^ßøÍ£°É¶<ÖTST#u6THÙp¦p»ôqØ¸`¿cá%So6=Hëq?3Í2H¡àËþþÛØ8{hüU:éÃíûåBn½ÚiñÓÞJ=KY=æ:WêG"â=gjácsnÆÁCÖÞ7÷Ã2GO18zæ÷M=I¾9eKÛÚ0t½VéÀÃt4/A=JºÂüÁp­ËÕíg¬/I¼ÁOt¬O´ZSõ÷Þ{®s,F´²¢¨©2-Å=}n÷#W=Sß=²´rÿg9f×ßtæÉiëµ«»ÂÇð!#}Z=gÈÑÔzÈª8y^0ÌµúÿM~ÌÎû"u`ZFäeXã¿=Kò{lXO[°K¯Ô=@EbnCàüó®c*º²-BÓ{/CTïâÀd­âË_á1¶,2ÁZXFýb¹Ð5=K`9dJ2ù|«KD¯cÇáÑNK#ÖÌüVõ½;©!jº¹²tÑ h=Hs,!J·Ç©§ç·â=I)Fß9-7Ê=g¡Âß=gÍFSoÀ=LýÞö¹¶n7çöþÎöüÞ2g¤nÔ¼´V9tUW1=L·Ð"Íàë=gÓÛOY0Î+7dHE²&Â=Kÿû?UæQyÆò¨Gr¢bÌ7Å¬ð,Å=L3wå^¸[W¸½dæ+ÁÕF#ñ.%GnrÈk¦(zéqÁ`Tß5ÄØGD{$uÉ÷4Æ%ò½æ¿*çLÿàÏ/ÙÇ,LóµÜ=@ÓRZºÜçZÃ(øc´GÍ8¿Ü=J1aì¤WÎ"f]åÿIu@£?&[)=KÚÑJÊÓf>ãb77K=K§ÜvBÑXñN{~È§Q£âGÍ(YZ£z«ÖóbPazßß«Õ.êDÑµà-¡à. wöñ-Qì³TJNl`4ggÜÁ©Ò´¯»¦I:ÒÐl£]r£ÏÍòN,²Ñ^åXhÊÃ#Õ)¿lX¤=IWuÿÑ]½Nrç1÷mw|7ç=M]hãâé}=KªÓ¨=}bÿ¤tñ$=@½Åg[$Ø),ÊÿA5º-3O¥FZ@kÔ=I¿=HÓÙæZÿUÔ>ÈªÂ@Ä¼¡9ÓÝ¶ÄÖmù=Iÿ¤°mãI:evººÃo, àÂ«A­!8.Øi+yAÀr÷Ë¦°QM³»Ó[¶òc3üXò5üeO1=g=HTAÉ¨ñÒx¥MÆ|Ô>G¦%wü¤$=öÜÌWFöCJ¼sì-Éiß=@½quò,øÏÞÑ5Áf~½«Ah^u3kg%ÚÎ½ÏF8>Ï4ò³ôYÖË:¸Õp®â}eîtdy®@wÍ`Ý1M>+{¸.íêâUqïJ9SÑØ9=gÂµ¡á#h¦UBOWl,ÑÒ¸þxTR)ÉLð©IïúE3Jú4¸Ý=Ô|¥=IÓð¤,vÉ¡2j÷ô¥4x³°Ö°¤[A^ëWÀ»®eíáäÖ86¿¨D_wöåòô=KçE^­!=MfÝ{=H=IK]û73·ÿ,"¬Q`aplÆl»I«Ïp=J¤h&ÖCêÞÌæì¥>ÛØÄxhX¿èò.¿Ù-ó3)Y©>2Gz¯½ÔÔ;f-x§PF~9h­?º[ç/ñ7Íº_5¤ÖÍ=M4y»ÅÑq>-fIô¶óqÒÀëÅ4µOUÿ}4+"p ¡ÐWyN2KÌzxðè¡C=}Q-h5=Bxc=LÆÑÀâÁéÄ#-4!Ý?hGh+=@8«Ä²·ª_Ðy©dD²¤¼fRò=Meðãd¨d)T½Ç_Ê°cvïÇ³°2`R¥-ËëQûa¥Ë@1ë1_v5BÅ"oWQøwp>R.pLò7c}µÜJ«KÄØTBÑQ*=LE÷èe´ûc£<e^EÑô6£K®¼¬ß)Ì:v=}õà¹¿ÿëÓ£7=KéWYÙM»Ó¹ÙôÊÍzØQ@×p{K,lö²J=}=@ =¾ºÏ35®ÈXÌ=M@ùQN2­:/­1UZ¹Æà ¢iuo¿P¨wJ¡(t=@^Ë!Ì>Z°£êçc:Õ¹8=MëpX³Üó§¨Jú$à=H¡=LÙy9¿qgÚ6=M½¥ûØ»Ç_=Kçköàc¶=H¶©ÐW&y²ÍmÛÀËñVoì7KUC ü=@¹-ÀïôÿÏ¾<èÙò=KÚrÛ`S5XØh®[t¯ò¿¦ÊßÆâóì¥7wÞqFÇÂ=}¯Rº#Ûn¿ÿ9%[ògºê=}=gßl4=Mu·oäæà±Ålb~¡d¼ßáE1Çÿ£òUÈV Ùø|Q´tNÅé=}Ò¾ÙÇéi2lH¨üË}f@à=LmãÏü5cVP =J7¹I{é0ÉV{uwaLniTÀyB~K=JùÄü=}·)öÂî¼Dwù¢ûµ-`=L=gpêÙUûý¤:¶ì6É_ÀÇ¢Ön¾:ë³|¾ ö=gØ"ÍK_èsèA«=@ºüùI!*;?ue(ñ=MV!;/=KýiÚ<®¨·sg¹Ko$Éõa¥=gÇ¬,r5RyÙ)Ê|Ò[âMZ9wdüÉà×tºø£ (ý=JÚyÐiï¿Ør=JUÛ3ÛyRÛ¼Ït9_´¿Ä=K¾=}Û8sâ5#ÌÉçx5¦J±]ºÒÉ¢ÚMjÏ¸ìUÉ°óMjÏøKª+Afå¶qHn¡663¾õä=Hö%Ü¬4aÖÕ±uc$gÞê=K=LÀ"=M]4±=JãöC»Qìé*ÙÌ=I#QXJq3p0ÏøTÙ¢IK°[=Mb|+ÂE±Öó|:p>=K-%¬V!À=gäFC(?Ë=@C)$µ`=HqåBÉÎ!D·+ä:èôË¨Û«$°Ñ§TO1óVYV§£ «KÙÝ»ri?`èKá? dð=I6EÓñãkzÑÑáÍ ª¨q=Lkæ8OOBMfÁ Qê;¡3AGý*¿@Ùc$¯q&àCçcðïa0cßm!=I¶"YõÏ¬ÿ$g¹d.Ïs7Ã=H8Òè@±d gg=J%ù)ýÓËgïçº¯=g°CH¼ó!À=ID7¯¿=J9ÿÿÁ;+yW9¥McªÒ0v_ÌOï6¢³ßæßuÑ«âvö_³ÿ.¡Ä³BY¹:¦#[¾ gDµAYO^We>²YO­nªr=à|ÅÑKY7Ûa´Ol,%B9"m^9p[ SÕ®¦&e¹9ÛÔKGß±fñ=IF!=IÂ°¯d=Hf=IYW¶7B¹Ãì½=ï9n´Ü|²k,ç_=g¬½?ÌO6=@òè:|±nïþD°C×:µõþë¼iEJUµc¦PIO ®¤|/¿¡Þê{ñ#Cë=gÖ¹YLX=}$mI$Y¨t.mªµK¶ëé½¤Cñå×¤Üe=K:Z,7`¦°ýyOiÖ2iÌa¾Ì¶ôa¯=}èføñ0ä³åQuÃ[Òy~ß£³È WóVô}*Å=L[fá³yÿh_÷cÚm³æUÚe¡yxèì¶Û¡À¢=gJ=@-¯@³TÀ>&©àGðTLL[Y>ÏêeÓ¤xAGÄï{³ã;pfv9ítêû s¨¡¿ÆåÄ<ô@ºUûDXRãß>.æDTTF[¿0o1C1ÑXhðÝ¿[³Ô=Kõ=L]DÇ¼£ü_ÁB¦·Mg.¼A36=IcbW/í=}ì£áJN´AÓ#=g·Üv=KÕ)RZ,=Jw]ôº!¶©$é&%q»£§Õ"&ßAö=IàßÙuND»j.M%ÉU-Kh_Å-p7ÑÖ4=}ÿÄoVXl²qPåäTÊ?¸7ð£)ï@É÷PüFÔþÇYÈwU4Sð ÉPUÒõ-¤Ðà(f­¦¢¨ïË4FÑ=Jøi`>pË 9G¥Y)¡(¼WVÊRb¼àÂBãq¤~Ï à{ §Ñ_ñDÑùÒO@û«jÖc¤³j#=Jõ±Ì!|ÅO·Ba¿ÔÕÙ@Tþµ[V=ÉVJV$-=LÛxÄrÝ Vôh(5¾3²)à¢QªIÊ4A|[©XìÄïò__E¡Óa=H=HÞ(¯=@äÆzüN®ä¼ïcïÈÄ©ôxE¬Îü0}­«­¤2Zpw·®(ß¨éüOT¢@ÀÝèaCY=Le^ª%¤½Uìã¼3ÜK=LK=JMRLñ)++Jï]Y¸êèÛÏã4QÐQ:¢ò`=JBëér0S@0NÛñ=ð %UõN=g.²ÈãÚò¦á=L2Ñù=Mæ)§ Mÿu×ü¬+¢è9`eñæÝ½)µOgéiÖáÔ®Á§jàa=@K¿YâÔ.-¾EÞSu²no`Èw.õ=KX¢õêyüéNAÝ¯¢Ï=g§û¯Q=LUî=Ka¦§Á0§Óã·áo=KcpÃaÆ]=LL3ÒahI0oï<|Ê=KIgò×Xe¾tÅCíÓÄîÆª0fqnµÞñìòû§XµÈ*i¹ào*ò2`«À;Hèòôì3ù8q½^ÿÜÂ´°9ÍiMÌdøZÉ¼oFÄÙÄÁµ»_©;yã=I?¡WÂÁ¤±EÙQÉxÈ/2È%â%¨[ãäöqE¬?¸Eñ·±c=J©K×@;¨éK¼Û "©Qt%Ã§~N!ïQ£+ÝÒVÔ¹ w3eòÇ¦®4±Ú¯|¸ð$$§ðBÄcøäR@Éÿ::^Â=@í+¼Êà7¸C_=gïsUì]=Kþó*®;¹c»#É¾Ò=K¡/5Ê¶=@»|ñ@M¹nQA¯è¿K8§!éÙÍ{;Æ=gä¤ÍA±=Hg%cÍÞ-=@VC÷-Í[IeOû,& mIè¸û£yÍ7"ÁÄç8Åø$ÍûOVQÎ®©]Dd»QôüáJÒ¢æÞaãqßÇ¤þE-Ü:=I_ÂDÆÆ+¼½©ÆUWµuÚN¦IÃ)ï_PjÉáj_os]¥=H?º<=L:âQÍ|Çw¿=}ÿ¥§=}}%,=@B^UÕ]Û£Éà#^ð^O<©½Oó¸2})¢TµUIH·=KXXA=gÂ=KUªQº¶(Ç=HH ¤u¦,êk úÄÑÀ_dyi¾MÒÃ¦õÎ*Rn¾Fn¼íìúcPßS$uÙmh-¢]Î|oèXeMÂüû&ïPB? _N>Úåï|XË=K¾Ã9¦Þ~Gµ©P3¹"P s¥F¾ã-¦ÚãÆS=gi÷w®~m29¥C S=IhïÒs¾BIß¥Y=KR¥IWõ=LÍñCëç´M@­®ÌÐVÙoLäsÐÆÖa&X $x«hÍôÏ!æÞIaa0T]&dB+®ÈÐCE³^2(Ná§=LÕ=IÇs=M"Æ¬¹`õ»ê^3=I£4g8ñGyêCà¡ïh@Ç¯À=gÅSÊÄjä5ééSbôw7+Ð^+=MçKPáMÙJ2"Á+ì®Ø?ÃÂ[ÐÈ*Å>¸=MtD¿_Lüÿ=Lþw­ô÷ï=}®1ñëÚKtlSc=gµ×c0ñ§6N3¤=}U/ÄÅN¤8¦Å=@GÒL>)½úç$:­gèô(ëX¥9Ghª¿².0èÆñÈì /.èà¨;×pxZP~KÞÂÓÿeÑÝYóõa.Ã=@ôh*Ç¡/?³÷!nQug_©1<Ñ!«=KÏàçÓ=}@Aå­ÐéÌê¹Âsåf=Lßo_n±ÎhbwgRc«9´# ÃR¤ç¿~úÎf)ÐµPÃ¶o=@¬$ÖcrÑ"£ §>§cKv/n /=}Ñ(cLKdéÂw(/àKYøQFáßNTï¿Ôèu»?O3èF¨¤õ×K¤ËÒ{bù«!sÙ7½ò<<Ï÷í¹b¢Õ4®­ûËFb·s×ß²8LÅeNÅ·Òs,-µÔ¤GUÁÃaJ&5jà3Û]Bç=K, ïl=}Hnïú8=I5? ýáù Õ_³´âÄR¦ª=JÊ~êª18ÅõÀæQ|V=MGïf½Ö0°½ÉiF³é´þË=LÉ¿Ð0²íÏç2-·iRÇiÈê/¨8Þ¹b=gfóp=@®´£©ÖEºN8ø³?÷ó3ÿ©¨hÕ£¦W¬dÀ+=JTÂHÒ·H?Æ`31´«6¤äaWúÒ}ß>Ù=JWJÇQÑA|=M´Ú¾*<"=J¢X*bav¹m=M|«f=}kYR§Cfd0ð³ÚÌ;º2ú-¡¼Ê=K®âWAÅ±Ù&jWfãY¸º¶øè=MÐÈ=gl´¡*k_ÀOÚ¼±uÈ²ËWe=L¸&åÙ3µ~±=MA=I cV-§R9]²óÙGÇõ»øB.-+Ì9ãÕ-#X¾ª×WÕø¾Þ¿ØúË¹Cÿò3?=LlWo#=H4Õ©ÎãºÇO±B³*C½4ñk-xåjàÍ±SjT¬ÉCÒ0?XC=KÃmßÍÐß($à5¹^8=g´+=LÈ@;ÚwWH÷kkâÃ&[YÉGåÑ"=MBNL×R&Høõ5O ú6O)nÑk­7GØeMX¨=5j|dÀI1=Jµuß=}u_ì7 ­êS¹%¿Å>CN8Lc^V=J+3Ø¤o·/L¼k=g0?§óõÑ8UL¯ü£]¨^EX£=H¹l×9x3+Åô=MCSÊæÑzW×0]«F D=gd<)]& @¤-/âé=KÂ´f§=gNFÉ©;íèÌÿ- ¸o=@4!=@=H-È=@ßEHw>*4x¥l=L/±£dCÎÌ=K(ë¶-_8PK=@Í=M¥°=M.¨{h×ð1^=Ld(¦ ÚÇÇUÕuv£ÂZÑ@ÐÀßuÇ`Âò-ß¼´ÿÀLßª¼ùiö=I?½ÃlUÑçx¿käg!=KQ¶¤×y=MÇ0FÇµÍI=M=8èKTòaó&KÂÙ=Ipð<(¦`(t,=@ìÑø7ßO¿_Ç)¼òla|o=J.U"Ü²2t±=^q=I-Ü#¢/Ç[Ë?ÞªÂaM³{ÂØeE¹Õ=J©ÀÊK£r=H¹è¿ç×,©g9&O«Òí7ÔÊ×¡Ê4~òXTìOìïX*A?p.ÚEÏë*ÿ¼L°ïÿ+v´­·[¨·&âï±CÌ3r£=HâÃH6ÝÛ»=}/ie.x#ÐÇ«ÂdTGs¯kýÏ8ÿùtu<C=HÓ³ãM¿j ¯Ì1=@G1Áo=@ÈÄÔV°©;±Ô#ù°"a?8c¼÷QéT½©=gÍ ]Ê=@/ä-=J-¤wêQ?REædCsÎªKmèA¢t*=HD}ðsT ¡ëç#=KVòÔÄw=@Js=gí?Vq)¶«"ÁóÑ=J%×qz«Ìq ×+.JâæÊ¶bo½ðÛÖB]sýjÄ±·Ívº·õÞØòå¶jp¬èÿá}V;ûúkLÆiÐá^XÛXj9ëgp ,4ÇáZ6gLî#=M§4¼ª·ÉÕóíáYÒÀZÂx¶MÝ=»E¨)íp4ßø¿?tmêuÔÞ<~ûÜï6ÜÞ[~Üe¤ÁúLì ¡=H_¿¥§=g=JÀå¼p=J8¾6 <Hêqý±ÂM­Lèí¤CkIV.¤ Lèã¤3µ(Fy(LlI´(,¼x!6ÔJ®h!ÐJhÓÐJYè÷ÃJP}ÆJÕ"Dy"(ÑBí9.¤.XÄA=KÞGé¹²Hì8NÜülF§Cÿ®=}ïßí=LT©pùç&·"î¾åp°Â®dÖðH=@óàø_«èa~)]¼ì¨Ò«ÄõMã±û3nÚéjÈîÐê6l¢=L¢2;©[ìúl2AÁò/Økø7=Hö3ÏhôÌ¹8Ô/í¶¤ÔÍ!ã¤ÝPI¤~ÉgÙ÷}³Û=MIvOu=ÌD>#û Y1ût¾|mÀÈ¶v~ºÆ"þê^ðêXhM"Z=güØ@jä+G~¡{óöª=H/ïçÙFèzuõ_DÁN=IÐh+×t¾à5=L×=Irkà®YZÎG¢Úêé0°y¿XÓKð¸Uhîj_=K=M=XÒÁcÁËj"=H7¯¼LÕÐäï=L×iµ4èVYCÎvÏê¥9ß§ùÂ=JH¢YÂís_û=IÄÿnRUc7êðY´=JHÍ¥|LBÿ¦¡áÊ5ú±°ÒÌ8UÑ¦Ùþ×°¢¸ßÕpéÍ{55Ë(®Á`×2eG1²Tp$=K%ÏìßKÎ£©î7wÀ_@g:ÐµÁ¡K(ú$¸§ÝLyt=I´Q-ñ³u<¯À0Gé×UÙ"xïRIJÍÈ#ýÆÐ)ôXâÚq7 ~Ï¸ÛÐi(=Jâ°;å8N=gvE»=J =Kg©&ÏDÈÿ[}`8q¯<ü!º==²=gA¹¯O?ìüoõ5 ûÉ.Ùæe+s=gîØVLäEnP×+&11OÎAuM9Dñ<Qc7+%ËÏ9þ=K@¶=IêßÄ=gfæ(eÓ^tÂ6áÌ<¡åÎaH´em=Î³e)ËVK£ªßX++°"Á-{t7º ÍÔmÝ@ÈDo:G5hqÑ±Ñ:ùYi|<XæKwXÙÂ¦ÓIµ«+asÑkÉØ_/ûìÄw¼ÂÎ{6æ=åc~º,ÅBbyÑµ­>SyPñ=Lä¨²3HêÈ¢Èëå|(=JlZøxó$.²o»çC=Jbp=He@ÜQ"[ßý{,{=M@9¶ìw¿¨®ô×0ú¶Ôøæ¶¯åÂ¬ÍUhç±åqe¤X3Ôæ¨Êµù·kH½ÎRÃé¯oOéç×ý¿®$F÷YQ?´Ýy àî·[Ræ°^=ggºèw7Ò<·@ª¬=@K´5Ê+=g?Óß¸=M¦©PÞ0üåéÒ@}ÑÐ9ìÁpßS¶_~øÉÍ/TÌ*pLRªïºØu>Y(ëm®/PÈ®¼¯ =JPf`FÒ)ççÊÍk=} Öfn=Jew=J}ä{QÄÚ4ö¸¹µ=¿§¼¶×I5[7wGnÔ,ºÓe¶oWX=@vÊ@ª¯Ü±ÔYRÎ4íÚ¥]øø½µÊíÃC¢R½Ü("­¡È­2×rq~Á/c7c85=}úÑúK?#ö5å±à3é_9=LÚÙ}ò¬B3J@·ñ=@O¯²?=@=I¶=}ÇIt3 FCðqº»9¦ÒO¡5ªë±¿`9òØ^WãÏSëÒ6=L_Àz´¯G¶?¨æ­Á2ÿYÙo9oÜéYfi;Ü=g=@h&Ç·pÕ«qHgNw=@()rfÝE Ó]`³w¡°7é8öfk?4!Í=K cgÅ²´N7×sðÎ N«Å?ã):ó¥ÿMâ`5ÇÆÕ¸,SNkM=@_D(äÏ%CaL=IbH,xÊñ¤ëc½×<¼2¦i*Êg°Z!]è;øaÓ¹=@ûGÊUÚñÈs=K¾ß#¤ÕbX=Mîö?CN,åÇÏ4Ä¡ë+¸&AÜ=g>d¶ê=MArøSj¡=gÂ.S0)O×^-G¥·V=gmaÖÎR=Hv÷äoiër|éöº=M=J´Z?Qhhëk%Ñôt{gàñÚ°%bIZAK)Yd|@ÏOgJ¾óîí4T^¶¾Kðªåi!)6Ù&=K#«P=@¿!ÑB§¶úPý3ÓI°,d^pç=@BKNlP_Kò«2Mp¾1Á¢b¬øLgj)ÆÇ<­^R¦[!¯©Dçâ¼r-Æ@JBÐ]2à=IMØ/Øü`eÜP=ZE²å3=Jozs«¸5ª¸Ö+k§iÕ=IUFéiNXv©÷Þ.=J¬XGjÒ9dÛ×=}_v/_-1d«¢YßÛöaM¤ÑJ8vÄÌ"µÁ8u:*ÍÙ0¶F3+^F`ìg H&A´z#Åuü=L>^áÑÑLú9VñÑ¸F÷9B{­N¼Q©¶=M×Bp:Aî>ª"·¯"±¹=MÝ¹Zï9aOQ×dÞGFG¦L¬W}Ç9}7¸ìµ`r¹lmMìµóåÒµcylà£üCZÃÛ5´ =M®u·Ï?[k[¹V3 qã¤3 )¸i&àbÈÉÕÄ{Z> #m#v{¤=I=LÄÕdg=MPù¥Çñã[ªLP¹ª¾#ù1o)À¾Cx?¥2Ç=K#àÝç¢(h"¢?¼®=I=@½ J¹=g=JuÄW@4Ç(lJ2fU93µv==MB»Xÿ =I¨,]Õ(¨Çb%|8(ò¡@=@ÈÑñxhB^@x¾15óèÂü<±#V=JbÉCzÂ¾/ØPwïÄ bE=Mf5ÙL:Põs/·®)ZÑÜyh¢hmUd{­åk=g}È]5=JL=LúqGý¥ð®²ëÙ7»ã=LÈ.Ì=H§è¿ll¾Q=KxU8B{ys¤.¦n,-¯QTÌ=L«©¾¹ØgÒ|ÕË¶õ>C¡Á_lá9ÐK=M"eà ÆV¼¸¹ÔòMÌ}»q¹Cû¨½Õ©z¯äý-=}t¯=K4Ï²÷wÇ­d?G¾X!ÚQty¡ºZ$¦åFp¥ÃQ°¹ÀÂ&n.7Ëâüª³LP=L¿D|¼=K®h¡½©O#·,ÐÑÐ¤¤QH2¥3ÒMÔ¢&ï0IÂ^ÌG&Øª!óqD)Ï­{Jó¡o ÐF3hUzPök=gÔ¦Ï$àB×Ú$RäjX.ÔðH¦tdâ¿rí[*å¯ø?5Äó*Æ]@Ìº~á:ïú ·?b¢ïqZÀ=JDÓð=Ã<v£Ò0*·ýþ´+³KÊT¡¾=LüChGá=Kº¼ýØDZgã?D0«D p¦Ú¶ VF÷}=M=IÑ£§%©ªahß)$Á¹0SiV=gn²*=JÔp0?È:é2ªUÀµW¥Ùñ#Héªg3u7®Ù£ÊV¦ñ±ð¹mTY1[GN!!ßA|:¯/wqÁ ýÇIÔ´zÐKAÅa¬¨&%ÿEõ©èº9¢=}ùÝçTRïÉÐ°ù}©OÎþ6n&ýÊ%=@(=gZG@Õ7Ìx¨ººY¿±MgªÔï7=@ìëÃcIÕú¨2´Z.Ó¤9üñÕÚJ6®ôÙi!qíÑpMJ`°õªÏ~CÅüsîPÓ%7=M99¥÷5=HI©FiÃ@Øÿ¾L1xØuéstç!uAçA¦g"èT[Y:?¼Á«V¿%¦ks*¥ðÊªr=mt!úò©JTÕ¿6ø­Í¹G gðôÞ/«¡½òEÖ>µ>¾º¡õÊ¹êîëÎ­W~×j¡WÝpò>~0þÚõYî¯¸U©ÁNÒÑyé/M=}ï;£ì¬É)ìCÁ4|Â=@=JÏ&FûOLW½½ôo÷ñM«=I½éÚ!£Æ/Î@¸éÉL=@Røl£!§õOMl]g,ëHå{ÀÒ=L/1¾y¥ÌZçWºÝ©%Gð©5ÏZÑpÿ=IU÷ò¶YÙ _/6lí=L³F):ZbóRè4=K!»+&íV*=I(ðA÷a[ßßôO{jöµ1*àjÉ865à"w~êµ®=@0úXJ¡øG^°;ÉÑÄ=@ìÀ:OäÎ´#Íû=Há åbp®éS¦©JZéc¶;êeuWì¶¢@Äâa¤s?*b³ÊÛMì=H¸ï´+g§½ýJ!ôFÂOº%²=J½ãËàcîjõÜë}=L@ø,#Q(ð9BóÉ.W}(æÁ^á¨ûäL$ãfZÎáç»yF)£qt§kÜG`R5O»=@Õ=@Ä¹ÅìX-*¡ÔEf×"I«Ïõ­=¼îyß&ÇI¥q¾,ê±ºÖ,_ 8[Õ]L±ÕÒ¡G=MaHÇ!®ôwèØ¬©´×cQtÄà«ëÐÊ$éN@Òü=Hý4ê­@;çËL¬@nØií¹¬ÀXûF"¾¨TF)·nÔä=HÄê-=}«ràIk)=g¹_#0+=J=Hq-Ý!ðV=Lo_,ÇÓç.¦yO ¶±Zu¸òsuùS/¡N±a=I{*E¼0¤ÇÐaèCS[øéò©ÐGíT[÷¿»J=÷=TæÁfj3[X53ó=Ù?=L_o½¡ï¡_Â@¸ï¹P^.{»æ+îxôC§@®»ïXøÀ¼ºçW*Ïa¼Ôæð¸ªnÔvëIg02o³·´nAz0=L8Ûg3!Jn)ók$m¤gÙj0%h¬®=M=M%,N6»=HßK:»zÆÕeKQÔ<(ùMÉooÐß&¤Dçô=}ã¿5mu<ºÂ,¯1&À=H7MsRßv¡/:¢¶ì=K40@£AÐLªt¤ï²ò,ÂÖúÁÍæ¤o=Jæ}­<Ãý£Ï[^no²óú}ý1¦ífU©=Kg6w­ÍÎ¦w ¸:ÝÜA/ßopaÛé=KÚZêe$Ûe¡>³uäÔm=}®=x´ÏuÀ7ë=@ÂßÜ¨ûö6A®ÙRMÆjQ÷?-;X=KÝçµ¯×"±;Yím?4ñÜ7P=K:5GÜÄÍ±}]t¨É?GñEßÏÔ tYQã=KF21ÆÕØd²ð¿=HDr¨Ì­,Ì­<½ÿA:_*ùoIíLuÿ[«Sÿwìÿ=H]!Jë]Às7¿KQàëËÑæÿ=M[1Ïb=J EôVføæúÆÜ«*.[ºØWx]²Â´µ¤úÎpVQ*¾DýØ.àJh-Wø!ÐF®ç%+¾áE~Iárë[!ájAOþ{ÿíÓÈù¥$/Ñàq«=Mz]o¼Ø#ÎÀ¤ÇýRI3+êP iÒÿv@àÃ2Ê¹§Fç=J<]¸I:KGëv«°=@_*S+=H¨(C@;;7UK=MFc¡3:3ÿgÁ+ Î.ÒÕ=g;6OÛÓZ¥{îúA2ÕKºê«1R7ÏÕÿðyw=L+ñ£¯}ôé=KÏ±ÿ-2#=HÅÁ3T,égm=},pÙnF!´nÀY³Æ;däÈªµÅóêàû±eëÔ¢m¨zâA¶r³Ó¥HÃM¯¬£]ö£º½=}ñù=}Í>Ù"éIL¿½W¡Þ`SW¶#ßº¶òÐAà%ëL=L_Ï£1±þ¸1S;ÐjOkþº;múT#Ùu?¹=H=gÉ%§ÚÒ(AÂw=©ÕÝ¡¤hbí@ï¯AÈò@"]=J{Ó:°Ò¨U=M0á#aÃSzÃ¥19ÓÈ]toðªªÍDÊ¼´¥ZsI){s`FRX,}fiO§1=@¡®=JðB MJtonu({µÙ_´LI=@wJf(à÷ùTßÀ­ÔËS]Cäë=}mª@{pH=ggC+=LFËÓaÆM÷tåL=JÌ bi¾Â6WSXAÈéO9äÉçË»ùÙÏ=Kä*:Çùp¯êXA!Þ+¥M¤uñ³m}¿DD:fà Fp±¹ ´=Iöò3ºÀÖa«a|Õ>½ÇS.àk°GYwl/Ä°e¸) ¼(6Ð²j=gb?´i©9gòSz%q¶:41ÇÔªmþòN=IÞå£=HP=KS¶`fPWß%#Ð4=K7ª¼.%§W 3º )Ae=@, qAJÚB&M³à7T9ûV:9·Fß}*Õ=JÿDBDv¹+9ÿ~-¹ob¯½y¢u)Nª&ç °XÇy3=@kmm,ªÚ½#ú¶·À¡sCT¹ÙS¯Ñ¥Y5ePWÄ±Àqºp;0ýÂ:=@%C_½=MAÖ?R 8/U¢©w %µ¥§pVlí^dEãQÎ=gÑÉtAT49,?°3óË=}·í!ÇßªÒR=HeWè/"°-Yy=@RE«Rw*&GØ[_ê`b/GHªÕ"LÒÐ£0.ÛÏc³>TX¯IIÜòk÷¹è=@â[ÄKBb_Ë.#µ¨Ïb©HÿªM­Ù=g§#¿ßûÂÝ-#*32à%=gÎàf&¶ïì0óÃÆD=L>ïZæTìAÆÏ7T`£C9ãÔ¥öÿ=Kt=L½M&Êþr=LZïèR=góÀ#ÙE2UF=K¼ïgõgÐóèÅ±h¶Q=Kí^=gÿ=JÄÃÆ©´µ/A­#tEÃU1=K¸Hs0cÞôUQMØAÕÌ2m+=}©dÞÈÊÒÍ®`eFîõ&aIg[=g=KýK×=JÜ¿}õHÇ÷=M£=K;?µ@kåRÜ=@§ãsa¬0¤=IT0E[TêÇG=@+ÕMaDS½øöÄ+ÍVé4Ñ5=g7Ý&5Ù ccX8hC¸ÐCQpæö5=IÑ=I=M­V?£GÒ×øÐAýç%=K¢áLù¶l=IÉ)Àë`ôÉ=KÊÙ75Õ:B@39zÌÀÍJáq"ø§=KÈ:$~$Òûé,5a`4ØMØ=g2[4"=MqÑVÄOÌì=H3-Ç+¨<v8Y¡ó¡ªù©Ñ%qY=@¸à»=gÑ+&oDk¨HëÏxì =K=M9§?TCN6â[JÀj¿Q«¤§¤R^u·y­m´DÂ62ÓÛSÐ5ÙÝ,LG¦ÂaOodáwX0vë$Öá#)+¸Ô¨;Q^FGn«?Ãæ3)~MÂ¨! ý!=}ðäçB§6oEBõ)Ð=IÈ`34=Ë«*My^éLÝ¶³Î3(o=Mê¡ÝBÏ@>£¤Ôºñ¹ qoæäôa³R=¥ÜIPQ~äEJ iÿ"=³® îoPýGwRÊ³£¦9ê¦=L=gp¿nDK=KO~vc»y>=g¸T©âªnEn/|úÝÌpÄåg4ÅR¸L(Üø$uS=KF8JA ]=@°¸¦ÎmâÍ{HK=Hµ²_÷aüopte2aKýÙÏs¿}=JÆ?Ö&Dójº¼Ôç:$S=í!at(³¤8ìyjXÖ7¶UÒK¡7Â=JvuîÏ?®ªñ¸#c¹Ù«}%Q¾1òmIÌÊ@×»ÔñTüvç>áúÑë½iòÐ±½ÛóòtþLá©æq=}»¼âê|x&ÜX}ÞrÞJã}CÝùò=Jº®ac0!>=}8fC±xÄ-ük!j­ùIÝ;Ç©ºæ}&:ÑJG&7?1³j£3§Ôjø#ÜÝÌÜ=MjiEÜN»äe"i±Weå¯ÅÉgÙ¬%Af=M)CEu(Sæ ê©÷°£C=L=I-møÿï=}Í6?ýæýÈ­Â°ã±Æ4ñhÓYÕ?5=Iy²bè9Ù¶zoÐ¡$l=@èµgu_¡÷³¨Ô_=ImZG6AÊ`OèìHw¡-=JóÉ=Ho"þ!à"ÿhnfõ:SfÜÿZòT¤g»_GW7cÞiIüRASÎ»P=}»¼éîXä ªò¹äÔÛq«®ÕKØÚµ-Õ=Iá%;Tª{?¨^®UQ;¤Õlå¯jLvq é+z9;.=JtuÜ¤!qÿ=MH¨7>ãßÕ ÀñÜO­o!¡Øc8k]Ô¼#£ô=Iº13°·%²d+´XÇÖÓÛ°(ã»Hä=@«|:3 ìãQ¦F7w¿s;=g§î{¤UU-ág1=IaôÖ©Í6+­GOÈj±8~âaQµútU_)Ú=@A2j³IcRhò­mR¸k)ÃÖÓÚÓß i.Íµ¨¤íe8ò{L=«LÜÿ(ñÉ´³Ù¨KV³?¢Gå*E)ÄâÓ©°æ^Ð&ÊÎYÃ±¥I½L¤ÃQ =g0yÙÜÐGGOÖ1¯ V=K°[.åh{xÙô®R_A>ªU%5ËméN<ÊJøj{W°¹þík#¬!²+ë*°dKÈTV=}ÉóNE¤.Í=}D£]]a«A>ÑõsL¢4ãÉ=}`{My¶GéÒÏÊ±ZÏµÎo,BXæ1|TþVyÌtî®Ð7=}ÞÓLöÚCñ¢h°T+.Ó÷°âouhY´>lØÌù}QÞhY´%G«´Y8%.Ü`ú1ë«ÄÈJbÐq­¼8ÜØrÂù$1=@!²nÐæC°,Ìê4îSxÕñ;ÛLB ÑóÑ+¼áÂ;Zq RD¢²­"¾víº~^÷nb°ê=g£ !WRËÏ]~ï²jÑøDÍ)±¦ì~ÛSÈ·,üºÔíìÎÁU3n=@³<uZOì4$ô®¶µÎä®aê¥ÔÖHnu0tbiöÀ¼MLÛ)»=Iô;=gö¯Ú4)áµæ=}m.µs2ÈnÍI¾ÎXÊN,õWÝ!XaoöÎ$A¥æÑÇN¬ÃÓ-.Ü%ú³[ë G=@ ~ðK½ö»¡BöR¬Å±°)´2ÐÌ«Ðãí­Ñyê¡=g~Öî=Ó´ëA,jÿS¥PKôk¶pXQo¯¥áÆOpÄÚmûúis_­ry_}¹[:5±toàAzó©sU_ëÜj=Jg©]z=H°}y)=M²EþkºYºdæzUþÆ6ýÔ¨ã¦jX(â#Î1Zs,ÔÇ±Á©%oWÔç·¸Ô÷7ÿ¹É¿¿«ÅF&k·xmø×:ö<(ß9AÇ=LÚ8±Ddá¬9¦QÕÖB¿+>ííhxßFnaÞÏ46pËUâÈÊ=HN#~L&8}çìO¡3B2Ææãa85y3>äõa@i·h0ñ½ÍíñªªðLòß,×Rí0ï TaL+ÏD,_=H²=²·ÿ=J=Hó_ DM+._©Q>¼éA]uÖ%(­XÍÿµµÕÙGµVn 1Zâ_#&úËâXmmîúh_Î}"õà,s»W¥UÇ[^|O=g/"jË%.§U"d=M×=I¯­@24ïxa>h6µ¥ø~(MSfÉ@º©Íí"¥à£aúv?ãêZgOÓÁöpmÔÉsqÍ3ßÙxÏ/9)`4|_NÒÓ¦ømõ½zYº#J×Ïê£"èÆîæ¬ÖÎV2k3¦"SJrþ(lûØÊÈågËÍöÒNKR`=}57¢*9µ=LÙX¥/å^´æÈoÊüFª8a1ð³·e5Dà=}ÃhJái¼sIðî ­9±Ó9Yr=JèéÿEàý_,Kúo¿=J"Ý¯Íí/Òà¦JÎòú¯ëØ<áüLÙvÉ16Éön=KNiOlâRÉª&®Þ±ø4®mnZ;±{øUîú©ì<Î>ö=J6]Ttüì&~6,hâI+é¯vSDý=MZÞ4æ}¹rQr®-f»õðôVdâ¹&MøÀvôpÞÃêÝ=}%pþ§÷íúýÈ¸5½,,=}÷±FýÕqÖ³Hs>æÜ-¬³p²¤É°£úÉ8m{zø¿&V3û²þ«é»ÈØVüÌÅúEâ=ì÷ëXöüñmÖ&.üÎhç4ë´mzýäÕKë[rÚ´²õ×÷,ÂIyg½Òåî.Íy|è=LÜw}{ù*Bî» V%iù¬k5³Ö³>ðQÄk;1=g]tõ|õýÉÅÎÄþyZþº6]aâÎvMÛ°çç.=èÞ!°aã^·ÐÅ*Ú$ËRí®¸Ú|þXTìù|¯ÃÅÊ¹Ãö4øæÒÎ×÷âüáÖöCPæÖÛõsK=KùÌçl5=};ÇQwæ¢ºÜûdð»"Êiõ>Ñ÷±¥>#n=JÜÏÅ¶d#½:éàRÖ³±ð½^þVz«FÄ~múlÛc&]=}dìÊüÎ±ðJYÄJÆN½jÊ®èg6ëÜú­å}G+iðºöºÛéÅ:ÃÒ2^¯zÞÞ<pBñÓV,¶ð^>zö¡ªnzÝÅV³þ|Ä=HL)ýèåþ³éÚ[·Ò¬®P;·&êåÞërÚ^>ðr­ú°üýª©®VÛñØîØ÷µëwÆ~yv&ÞÏ-}MÍ¿ÉúØ÷­áÃÜ¬y.N:ÌÅÎ=JÆ=J-×zâðÚ÷ëíðêSoî5¬¾¸â²¦íþ¼VfÅÞ÷àÉÒÅÛjâ*Ù%U>¥ód5=} |{å6VXâµnbxdñÈ¶Û÷úäÝ7êÍúuÙ÷"î|7óz]òÓÌl²ñ=}Ð÷ù¢áÜoÖ×V¢5=} @ûáU+ëaâMîóSà´l»zöCÎ2>·xá5måýúíµâÅÙwLM{÷n½þqñ=K®{¶{ø5^Ý3ÖÅªÒh~í³ë.m|ô¢ÅÞôÓµ5=}¦];øë=Hr¬²ðÀ÷÷>îXrèUÑ;°á¶Î}íJö|#ðÐqæû±ËNìûÔNk:ä¹,v6°ðlà÷æìÚ×³ú=}:pSLñÛFùÙwL]¡ïÆ|R¯ðP<á.Öû©âíl;QwñØØ6+½IâÍGsØ8î±ZìúÀÄ¬Îûª½kÛ»[=}nÍ¢N¸ôá6=Õ0þdí)nïû8¦¶Ù÷xzÉz<qõØzk{Me¡é«â:c|eúÞ¶5ÓýÓÞU·íÅy XFØwØð³.|»õ7öú?ûµú¾ÞÛ÷=K6ZÊþûà:&tÞ¦$=òaÐõIÞr]ññrí¯ðé¼äuÝõàB5=}&XÝéþùV}S=}ßð¿Ñ6l;ùTÔé¥¼´ÂÅ&÷ó­ª¹ûðnW÷Ì³%b-­þ¸®o{Æ¡®=Mklâ®õþùò¡]=yØ÷$¸ðÆúû}FÆà5Ý(:pÈd¶ë0ÑÅÌTü½ïüÈ¾²ðn²¬yä¶VÝiâõSìrþÁ¾Ýnâ4¾þÑÓêö­³ðá¡w¼Jmè/÷4ýTxÂê.{÷|îúñ²Íþ»cV}]è;Øóû.ëýÜVtàÉ0Æµndâ×^%mûaN6¶/íëÈÂl{ÖÝ©úÎ½±ò=g®{¨»ú2ö+üð)®ÙV}txÊßÚkû»ôT¶Ë¸vå²Ùwm7Pþ¬¸ÜM×÷µé©xÞÙý¸64]øm#ðxub5}cÞö8{¹=gÙëÙ9{¥é«|Ä`îúWTYîØw¢ª¼]Qé½~¹{känzÞt£Îþ¡û¤Tô:­>Õ|þAÔ=L2Åì+;ÍÅ:l=g¾wÃÖÎeâ|f=V÷å±2lûÙ_áåäx8"lû»ÜäÄÞkh:e¶+vW;°üùªk{ÀFT4vNi;_ZÞäj²E|jâRKá<þw¨ö¼mþåVtéÐûíqò&Ê~üÜ×2¯ð´ú©múýÜÔ5]¼°»gïÃõrÖØw3"½à,yl¯ð|Tz]~²ò¦Úl{HHûµú.k{fyaÖúþ9éz¶þô&³wº«RÕmºu|u?NÊ¾jöF54²ð©¡÷ZF¬M³²ð½:Ê¦¤~Øop6;ù§ÂBÝÔÎÅ¶ì+î}óH¶Þ0ËüýñÊnøÊÙøfØw¦÷Õ4·~vNÖ>dYø5½½+}Þ©:­^>Ü,>"púÌ6tþíEÜ30ébÎgüFÞT>ýßÊâ>8zÃ¶Î)÷õÍ¾Ùw@æ£^ºl¾Þ1}[Ò±:YjâÐÃñ<j¼Vm.>¹îâ¾Ø°ÌÅª>-î½ð×ïÎk{MýÌ*Ü®|õ:Q·ôå=JeöÉûQâò9Ã,qË2=Lk÷ª²dÙlBÚwÖõðV-ÛÑÝÅ¾lÞpý£p¾êmâj#Ù3»ùúåk»R/{_øH®kâ=JÊ]luøt¾°p~DÒý4q¿®¨ÎÞuCÖ»(5ýøÐðÝ}ôÝÕjl»¹`¡Ò©Ú%<|n=gGcnlýÔí´ðd ÷Üx®¹ðJó{æ*Ûõ¶~VûÚÒþmâÃÅßú[öZ~]áÉÁþ`ªFöU¼Õ°öB~üÓÅæ¶KÃe&~â:¶~DUN²>rÅºtMþñøfi»qêÃ¶ý/ Ó½J+ûgp®l{}ªÃ§E,ÚwL²w|ÚF=/ÃÅÌå©ûúåúöÒl{B¦ÃÉØî-;ù!^öw·æ°]mâæDâú*´g<Â$¹nÇ·ëÐk{ZMaLîÊJùÝdâú&¡=J=}ç¹è@ávúsô&k»±vûÊÄj9«pâ^ÆÝú«þ45½PaTÖBwÖÅ:´®ÕsêNlûÀ¥.H¯ÎÅ6&U,·wL+³ÖáZ¬ávsû¥3¦ÇÅp7/ºÌö,kû»Có à¾9ÙÅæ¶~±ñÙ=}úù×·ØVÝãòÎ=J=Lrò~=wâÀ}Ð^ºðo¡Çð2ÙÅ*#Yvøü§Ê¥×÷µMpRýë=J®¶ð½è~úÝzòk;÷åÚºÙ,±ðàÌ|;ìnmxXðöÙuzêÔm»ÐøØE*VÜ·nÙñâÊ6Ú÷"â~wcÂË=M·ô6L:ûhññîÛùÃ<y¿=K&ól~=gÐmÓj=JÞ(±p²®éâúëÕÉÅBÆÆÞõ¦ÒÚv´ð=L¬ÄJ½Ýú®}5Ý¾raÒ»r]¹þc.Rþ¢,Í²ðd,âîµ|¡Úð5}Îzý^ÙK¶ðllâ^÷âù6ºô´G=K=L&Úí°ðNN¶0wJÕ"mú®ÙúºÄÞÖ~Ùü½R;;ïËZ¾gâjZ&ùÛqæ=@kû­ðö¡J=JÆî¯ð½$=}Ø=ó´Ng^°xñÉö1½µï¥t»ïV=}kVgâ%>ù³Ê¥¶³ðÁÃl°¤n=gW²­ê¿âk»ñâ©|¶Sì^xV÷bÒ­í}î¾;}JæÏ=JÎ]mâÐbÒ¹ý³mýÊ.vîÞõÍ°ð(lIßý¯Î+zÝ³?îruè¼gèy>·ÆáÈ²+½÷ný~¢V«æHö=J­=}¤ï$eöXu¹ÝÙùÅ<É bvcÈ`ZÉTÒ&BCp¡ÅwO¯ÿ õníÅ»wØ1Úq%¡+1jÚhÝ±ÞxÝåü¨{rkÝd´ò:ÖµáT=@ °ìú¾jä;Þ=}ûgïäÔ~ül¥ÀÅègÖ8ÅÓnõtCýåÅ[9mÓ¤â-¬·Ñ³Ó°Ô£UVpæ2"@e§ráÿ2aá£p^pè·¢VS7q{óðÅ=sýÃ*¢â¢V[yÐÇ=JÍvPsë¤=YÐ0Æ=K^0±fs¿·ò.Ê+æ4}ádæV[ù.§Ây?oÞäÒúfÜ_¼k®ÚuõÂìúfú=I±awOºµã5Rè=M*G6åiZ&=LÆ6=J AêF·wã·.¼µà.ö6AÌ «?G;ïÁn"k@÷àr.½B÷ hÊE§D7 oý£ðm4æ]shÄ$"&Jºsîe-ìÉ>Æ×>íªN;Âsè>kûnôî(ÅZpèè".3¦9¿KèÝ¬B¶­Å8äC2k¿HÂãâ¦Ú[æM½s[Äø³3(Z!»æpâ.A ÅÓvUA^ÀfÀE¦o1Êò[æÞý9àF}¯àzõ {fÂ¶A÷à*<^!ëA÷à2Nu!{¯à<,î»ï%Áj."ûàX)¦ýïÁ^íBoÁî­@/=Hà1Pæ!û=I`7Áyò*FçÏ=H <AjAr"Ù¿æ=gA=JµõúíÆ o=MÁ7~?WïìVeJa[âíC÷:Á]ÕWªf"Ûï1A=}oÁ=Jok"û`*AÕôäN"£d2`Á:Ì2¸ÿ` ÁU%WúÂe;ï9Á-këUl¡ø^à==LÁÌ]E8b=gþy/t¾µ"5ÍDºVáæiÆU+6¯=gUa@ËÂ· ÂWva óÞK}/jv1XÄïÓæÈãO+¬W=KV{Ke~K-Ù°Ä¡÷ç|ãÀù®c±â¬ÈãZî%®_»²joå=@àU+ÿÁÛ=g =HA¢­C÷`5ÝnNC½(Ç¾ä[³,+BØ0Ór=IéZÄwÙpÙÓìº=@l=L¢ìþ?^å9DÆW¼jËÿ@N=@=gùOóLjbUÂªðâpú=K.À7j0DB0Þ¦_°è%SL»×â/Í/½R0µÖÿãþò9ÖÄWÿâö>gKà^0Nÿ°n06¾8xÜÞÅ÷n=@_Ù*ýFÿò^ÿÄa)×fKMhh=@Ò /"qå§G¿;R/>ËFLå¥=@òA²xæïW¿[Þ!_-h/º´áÕ"{nßÚ¬EçÒiÇÛÝ6Ë=Mô=M]*âwyoeøËIRìZØ=J-¼É£7Ò*zÿÿö/Éí7§¹¾±mçéVÕ¬z 6úó·äÁÔ<mØý=K}yâàA@¸ð®}RÏ¡E¥p_°À_rÀk¬d}=J8ÇàAå9/7yÀ=g¨z8zz2ë²zÀ"Ë M)^Æz±¼¼»Á.±fBøÀZQÍ¯^Ëö`-ý=Ró³=KãI2>%ÒÌv×ºå¼cx512Ø%Ë0ü`÷ Ö½¬fºñK_Z½=HSF/0þRñfÈÞðl5ùswäû&þþþøt.;þ~Ýþ¾~Nä½þ$ðþ¿þãþûøÎúþ-÷òJàâ>f¬·/â¾Þ>Êþ>üü~Åî~Îûü[wÈ8÷þ<þþõøôÂ:½þNû¦âÊuÏå5w´Än:Ç@n5àùÝ»i0§9w¥TèïÞB=LkÇ^ñzÖLU®ø)¯÷ú&Ãøô¬Î$íü¡L¡ØS<uÔÃT£ð0ïZýñÍA+aÃÞ=KhF­¥¶8ÝdÅêÌAò»ø=KÒ=J|h3ÿþ12B ÛGÂÅLbì9vy.Jj©ycí0þ/>Ýø5F%½ÍjOÓ+¹´´2L8§fÐ_Ûb0â½Ù>Ñ§h««b¶mßl£i`%>Ü°Ê÷ZZ%i3+ívÏ½tB­RË=g2t<{d°é?j§åw|­4jÜ°zþ¢jöl¹xÓ{k¹í=L3´81B÷¹7ÕMæÖ3§TÒoOü*ËLe°XPk·(OÇ@]óI:¥5mlÜ°jxþÜÛÙ¹`CÍBlÌºçØLÂ5-®@p³füß´L3²0fÎ¥=g/3o"ibJ|´4=g)ElÜyèvjeÅpò3Å¢:eÌõL¦¬póÇþÚ|òÖ5ÖêÕÕ«ëÏ|úÞPºsÔ4Ö=UøiYå5B·¹z¯f¯;×xräÓSÕ¨zÞ føË·MÇ<jwõeD_ZßÂ¿¦.°A -ÇÅLZá:+]/£KAHgÌÓ9ýéz¦ñ®+**Ê¢h OÈ~¸=LÏ{3ÆãeffåæeK£e!<èG/¸Ø=LOÙyõo/,hhhèè³QÎþâþë©CÂõ¶®ü_~Üö=Jëî5ú<E~ØÞ½}Í´¾ÆÙ^Áýõ§=]L[º]âgöøÊðÂÂ^Rýq÷Jí ~È¤ò½ØÂÉ^ø¾ããðVñàBÎÞ¯üû÷u=KÐÞÇðÅøòMíðÁ`»×©îtT,$öþu@ô=LWK ä=L=KWßÈÕÆ.¾qu åz=MðTÃ}æ+÷Çqµ&v#>IíK>ìaYÿ=L%+¿ozcajÿ=M%øB¨÷n7bz»¹F=J»ìtÈûYUÎ&56+@ò®I­îh"wN^ÀÞH(¦=@w>Á¾Æý²t ";¨7¿B7Ís°BZ]îÈ£u³ZQ¹l=Lúàµüh$«>ªÀ´ú:7xîH¾ÛP8=L&Ëÿ³ÎkP*x9ÒiRVr£=MFYÙ5°D£¥¢TßÇ`k¾°lbzDØuçÖîÜõ;=JmáÚÎ/9mZbï,FfY¿3µì(×È19ÆÈrFòÂU¯LYÚR¶$-vð¸òtLq÷J.òø¾÷¬¸^K5¾î&à[#Nås£3Æ¡Ö^`I9ÆòA»hrÉìÖD×3u=@zÇpÌ}õ6ËÁ°¼ðm¥´l¦­Ù¢^cÍFë;X"Â=LF¬uþÒlþÕÖZ¨øßkg®öXÈZa»ûÿ*µuî&H8ë:z=Mý¬8ÌµósÂ0Ïýºò XÞ¦5÷¿ozØbÀ®¹È7°>âÓÓ´v{Ò_¦Gq±î|=}ººBúM ô±öýô§<ÖQt4I}­ÿì¼~<Ýû÷ØnIîÜ=ÎýNýÕ:<Ö¸>=L<Ô5KÃ7¯¾»ýéÛ²¶%¨ðè½±w|+Á¸«zºê¿Aâ­lv?J£o&)aîØn}Ò*ÜÛxöFÿë=}n£ìÎÝÞiþüìþe~ãÄÈ°]µz2ª¸õîüÐ{eÇöØ)4~m]Bë=²ÙíîÌªnE÷ªø~>4ZïEòî2®ÿÃ¸Nñ}k2KLç¦å½Ô{tzd[mÀò=KßÞGëÃ)Èü±ø»{ÁwÅurðíNe¢»úÉë?kXdZt7üû|=H÷ö»èo2¯Nk¼F.äü7ßøu^3¾0Gé3ò5/vF®4þÃ=L{iºÌÂ÷ÚÛë5`£×Á=>l=}{îÆëØ-lþ:A%keÝòÙ¼Ì¶ËSÈð8°ÞuD¬6v ýo ï¾LÛkÁ·¢ø¥¸=IÍrÀæ6FGøNàøÖißº:ÌîËnµ3~3&ÖäL<Rîmíæí ·$bË÷Z=M=KhÎ²äö=HrhiÝÁXÉÝBõÞËKU";ZÕï¸ÑóAÉb²pÏ®Ú"õr(ýÝ/ÄËuÍÂòn°²â*å,0~¹ÁíãíeÙ­eáf:ï¶¯ýÖÐ=I¬aòfÈb-=@u¨,·Ý=K0¶JißÈãt×¼ùtZ2VÑ¸ºJ=J­Àú¹¯û=IÚ%å5HÎK=MýÉPSG5Ï[=@°cñi_§nU·*áW?EGæ>=LÏMÚ>=@÷q1x Í4ÅEÿ½òÏ_%B·¥_z%õ}=Iâßèf`v¾H¿ÜÞQqõk=g¦=@Êsà^éãÒÐ¿ui¢^ôö¶þNú¾Ú>:þ08Û2/h½?ü×ìÛêõ¿}Ö6>ßõ=H!ë{íùcñTò¨|²Äûð|×ê|=No¶åRúÝ¾æî´¸>12þÅ+¶î_¶&â!ãJ^Ü¼ÎÞZo²SøÜôÒÚ`×~=Hú¾ÌÌå#xÙj·òö_ænGÎ³ÌPGú`í4Kà}M%î0.Ù=M£u4 @18Ë»îôæ%Û¢ÈÝå1xþNëvA5vFþÁü²óò½x$òãtuw"<Ô»ÓÌîðv<Á=Ië||ÙþÛônwï³í"uxIÉ}=ÿööÞÌÝØ°×=KDÉòe{Â=}¦ëßq?Þ~?ut~B7ßD_gmÿ+.|{ïÃ¾þz`þ>%ný9v½=J=J=K=gÀÞ¾ +3Ïñ·Î=H¥G­X_Xã´7´æjîõ×îùv: HèÒìP±ðö=Krx¬uÆ³¬Ä`åáîlL¯ªô=Lvuékîm[nÊÃK552l»Vc±¯°Õâµû]-¾;üºØ=I/u=@/ýqÖ´÷ë{Ä·öôóvN}ýîêiÊ9ÍüÃ·êÏã½vÎ}vþrîº×úòâ>;þºëNë¾2¸=HzÞò.Ë}{r]½|=L¦~1¸Ù{.b­:Û<Æ¾4¶ÙµÌ¿HÌüù4¯vj½ÁýâíÚØÐ2± õ®`a=I=gÃ=}Å8­ïå2òÓð=K~6i;iÖð¤åH=þvqNÂØ¿½Çµß=g¿å÷y¶xLurÞwxØFý«@z°=I"Ûÿ àÂ< 1üÏ=}È+Ï]pa ûÒÛl 1ÒVaîrÆê}}GEí);>=¹ÜÕ´ ¿¹4ÞäÀÿÅwÍÖ²øxrN6Náã.öo²äûÕÒy=}õ§3ò_Öw=ÙÅ2:÷Z5 E1¸EßÂKFÞ=}*oãò·Ó;Ù;ÿôdýawù.ÆÍÖÐåíæ=HÎ¶©Kní¶^2W#ny2@2¼vfí=H¶v_Þ*=K·ÝûÕË²¸ß]u0_J.ExyýÓ=}þ&A3®=H=HåÁÃÓj=@=@sþ~áÔ6=I¦ûÔñuçcäh¥<¬B=@»ö°*rÍÎüîÝö=@3ñï@á=@¹â=H³C5ú^î¿=@µöpFü_7þûN@=@5ö9þâú~R~Æ`ìû|ÚÞ¾Ûöí¾¦µºòÜ<®wöIZeÀ»h²¯ÌpÝíøã{zOáTºù·ò»awªÙl$0ÄnWð|ú±àÜ`¦Ä=L5y·@Ñ%.Â²Ö,Ý³6ÛôoVÏn.áün¯út=}?ë?GGopÿý=M2=@=JÛq.Â==@Ç=H-3OK?Þ½vÛþ<®=(û0ç_òòÖÒ°ÖÌ®7øîC=IðzÅàþáÍ;+¦ôêâ=ML=Kd=M8 ÉMO=g$R=M9!¡ ò(cyw)F ²=KKà)bð­Üæêy~îúº}þûêYÖ}õ}í¼Ö´ö½îz¬ô¼¾j<ÉõÙ=MdVOÊk Ã~xüJ~Ua¾dVPk½Åájá"×µNß¯uèÚKÉ÷VMgBØmðµ£k=K8DØ)}Àý1ÜÞ»$=}W rÀ^v.ð=IåÊPÄ&÷¦>8rË¸?2=g1éN=J½ôìÈ(â^bþ4b^ðÿÞýþ±ýL½>8ÄÂÖý¾zêÃBb°~^°îI®Cÿ¾¾t$M÷Ê=JÏ_IÛ®øT÷4]¾åm4=}Åí^úªß¦¥+G°ýþC½ >Åd<ñ~B>½Ä~ð®À½ý8ù¾à^þy¬SáÃId=}ãd½HSÝ¢@²=g=Lwª8Ö§3½¬WÕÅ?ùHèÜ¸_í¤öQ½kUù ~=gÌÓÐ!G#Pã´GJ=àN¶Ó¨Æd>Põd>Põ¾`ü=gßs×ÆÌsìG°=H<ËÈm=Ã:)9Ã-$Å-süÁðõM¤|ßN[pèKNúç>nMÜçÊ»/üÄ½¹ã8k¦§Ì¹nÍÙfrHiC¦X]ÛWiFþ/:ÕÙ°Çj-L=}ãB|zqÃY¬Ñ¥I{)=K]C?üÿ1fØ¡`Mö½X>Ùªæ]2Áâfèñöu¹CöZÇfþæÓÞæf,Ê¸QÛÖ:üho!ÚÁÔ;Û`É/î¤çÔxÁ»×Pk3õ!Éh=K X^0ã!êÕ£ºo-} ¸ÂðSP*¤{ÔçæÜdO$R×Uv=öeRÊâ1Z³ÐÕüIªX°ÈbTÞÎ³ pF4ôûòØï`lé¶fõÚsÝË6dÅ2û}Àô¿N³³|=M¦ ­´Ü(fgå!ôéd=JØ«WµU"~~dHÚVÑÕì96Ý°¤qL[ðXfHÏÌðèÓ/x©¦:õ6m°|m:}ù0=J¦1w+Ö>É=It§tð«¾1¹°ÝëùÛX²²g7é/5x;HM}ÉÅØéâèwé86gBÍg­3kAï;q¹mÝÂéÛ@=LÔ.m¦åü 3®Õ¯©"rÕ¡gðu&Í¥Ý²¶7öéAdÞª#cf°Æª2}Ý¨Ï#ª°HçkzÊÏ¨²Øq%=Kî=M=JW7èVõE=MeûÌWlH`qP¾äÒ÷³.mèÜG¾dJ÷*ð¡é¸¨nkKÔíjGÁ¨=pØ¾SÉ=@o¬Êm+yIx=Åä¨aéÄ&çá*©8ðæO=M;TrõBhÆoyÌô_Ï¬TÖ±²@ÌmFóAkY_ç¿ÃìJï~YêKª-*0Òq(»@]ËIqË$ÕY»¼ýwxØq»£ÍªïÆñ³`ÈM;Õ&É¹î&ÚHÅz=ãîZè¬6e®Ñ"`=Hý¿È>ð}å5&± y=}bµ³óúºXà,=LU´¡§ö+õBµMä0¶}³ôPTfû;=}­Ðl?ù¦°+ðçêê­Â²û.#ØÞàxo)ò$«¦þKKÌ°a«hæv°ÚwÿJqüWo*e :ÄSÜ=IYIñ]°8Î&Ã2ùKN{ívcduZVÑ$¥àWvÉ ÙmØ@Ó7û¼zõ³lÉÏÏ=K=M=Eä)ÐäHÌÓÏ¼Àô¥Ü"Ô=KeÃU»2r5á=gMqälxyM0æÄ vÛhw=IÅ=HC3mNwõ¬§RÖõ=Hm8ÂÝzÙ·)=@f[¯½úIÉ8 þùL!=H¯Ä-HÂ%c¨OAÙíÝóHÞÉõµw±ÂÐ0cvB¬8Få2eP>î³dÎ¥Û2°E½_÷ø5=}-¢x¨|P,ðoN¥×U¾Fq©%Êí°2³$¢"ÞP=}ÂN=Lt·ôÇáï§ò:µóèÒøÔMÄÐéÆ»M§LÞPð[8¼F"ûy>±§;4%µ¬>ârÈ~=@jy=L#äõ`E"72Ê>±î°¦PîI·òlÝzm#,³=®ZüæißQMÿJÍÕÆñÍ µ3YqzV²ºþ1=MxÆÁ)Ý ²·¬ºßI=KÙCô©Û<kÄ¦Æ$CÛøAÃ¨Bf/4A=gjGò¾ÑÃ@nÞUWÕ=KÆäãrNzø<ä½uW&`íLfYÝªÍXª-3ñmÂ¸³Ë7Añ·ðO5¢<í²6a5½"©]àçÏ¸xöÃÞü=}°ü³÷Ä¬,ô­¥Ô©yàØñòî¿s¾L5µçâø=}¢Ýðú×F=Jm`W-Såt*ù]×G¬°×{Gù×)¶2xéjíef£ný=L<¾ 3vª ²^ò?6bUsaý¨mWáÞç ¬Ð-÷ÁÐãôðêJ.Êwù¥=KÅéÂ=Hm=M]DàØäSs¡@úlÃxw`ë·ÏuÊ8.xH±Â8rãàD·N@ÖÇÃ=ëV=ÁÔÌy*°{¡,9õ§Ùr6úÜÍÒÆá6Ñþ®2{qWâÄ¬RÕÃ¬S2tß4Å=}KäôìijÞí4ºâ5Ä*&MbVrN)t|H=Íw¦ËÆ¡ãNnÏoE9âµ@î})^nEçJaHÊóM2Âr1ýºör o=MBGªáÆúËWK¹ÆÀrÆÃ2u$v~D%úÆ2ô´%Ì÷¬¥ ²EÆdP=LÒ((8z¶{mìýòU4:IÉÉa«âÌx§%%Ô«wváx½T"«îÐeíÃ]{ÇFðäY©w¦Ã=I>²×=}Ûïe;º5á£ã¾¹Kò5æg`æL:²­Ó¸ô¾Vßr.>YÓÌ¡~Ñ[ùÃE1àx+Üí¡Iº@¬Ó=M9Á×ä=}3;Æ}®=ÄAH}*Í=g¡ô=H*Vãx&z×o{® ¹T=}æiÀzßw¿4++ÉcNoÅ©­ß²46`Õ«:=Imqjù)ÕOÐ6ûí9Ä;µµ³ÚÜÞdvpÊJ_Mâu£>=jÄ7aZìbÆÌIÔueÓýÖË]¯>®ãâdZË¡1¦ª1ÌoÙoº<Ûw/¸<½.9òdÜ<=ò!Ã6bº¥âõm2LGÈÝbm=K=IÓÂË1[)ðï=HÖ^¢æfðeÜPÖ=gÓ@=JøÓª¦R0IÌãÍß<óG=Lf]ÚÒkY=K¼æbør ÌiÒ$¸)=J.àÖ=MÃ¦;áðQÙ pàrÝúIMeÓ¥s[µ2=Kr¼xõGÅ=}ÇetK,á,r·×üHsÜÏ=}ªÑ=H2X2}Ãç§=LÚbëý²6yeû+µÕqäßÆË¸vØÝSÉ(ì6µx^_48Fußn2íåB£ûÇJÀq¦Q[çÕíN¤ÒÂ,tÙMI4àÑj=&J!5 ª¹~OI=J=Lv<þª¼±Uæ´AúoiÏg¹A=Hl7æ`(<Ã³_k V=gË=üªIûb6Sá¨ª¯ ±I)à<¨¯ ³k£dJ)H¦S=HÜDTL(­!a!!è)È´UH]´©ïmSA×RÔ0TsGå·~?»x´çV}´çV}´çV}´çV}´çV}´çVýª¡^,ù$ºÑï·q½ n=gæ]Tíè^äBþÊÁÃ(®¬¢ª¦^u`ÄIEªS¬ekQ¼EÌY´êÓ4¬V¾XB$÷Þ÷ü¾ûPýÍG¶AÅP=}&®ÆbÜHÊÏ}E±é_­v{éGñÏ*=J²qb·M=°=Ih*¤=L-Ð~jo09X-*Ôeä´õ²º4s"Èöìî¤«s-duxPñ²$ig::ê=gÀ{ÞóD)ÔÿóI$SCù_`ñ=IÑv,Ï{Á¦óQáó Qñ¦ó ÑThHâgT,}æoýÔ½³þì´sßîìäÐ{.ðãÒîì,þu|¨}ïþ]þ>h®L¦ú´=K³=HzKµÉß=IM#n¿I=gJ~)¾G!êfØijÝw&Ô=@,q¬=þ', new Uint8Array(96738)))});

  var UTF8Decoder = new TextDecoder("utf8");

  function UTF8ArrayToString(heap, idx, maxBytesToRead) {
   var endIdx = idx + maxBytesToRead;
   var endPtr = idx;
   while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;
   return UTF8Decoder.decode(heap.subarray ? heap.subarray(idx, endPtr) : new Uint8Array(heap.slice(idx, endPtr)));
  }

  function UTF8ToString(ptr, maxBytesToRead) {
   if (!ptr) return "";
   var maxPtr = ptr + maxBytesToRead;
   for (var end = ptr; !(end >= maxPtr) && HEAPU8[end]; ) ++end;
   return UTF8Decoder.decode(HEAPU8.subarray(ptr, end));
  }

  var HEAP32, HEAPU8;

  var wasmMemory, buffer;

  function updateGlobalBufferAndViews(b) {
   buffer = b;
   HEAP32 = new Int32Array(b);
   HEAPU8 = new Uint8Array(b);
  }

  function _INT123_compat_close() {
   err("missing function: INT123_compat_close");
   abort(-1);
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

  var SYSCALLS = {
   mappings: {},
   buffers: [ null, [], [] ],
   printChar: function(stream, curr) {
    var buffer = SYSCALLS.buffers[stream];
    if (curr === 0 || curr === 10) {
     (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
     buffer.length = 0;
    } else {
     buffer.push(curr);
    }
   },
   varargs: undefined,
   get: function() {
    SYSCALLS.varargs += 4;
    var ret = HEAP32[SYSCALLS.varargs - 4 >> 2];
    return ret;
   },
   getStr: function(ptr) {
    var ret = UTF8ToString(ptr);
    return ret;
   },
   get64: function(low, high) {
    return low;
   }
  };

  function _fd_close(fd) {
   return 0;
  }

  function _fd_read(fd, iov, iovcnt, pnum) {
   var stream = SYSCALLS.getStreamFromFD(fd);
   var num = SYSCALLS.doReadv(stream, iov, iovcnt);
   HEAP32[pnum >> 2] = num;
   return 0;
  }

  function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {}

  function _fd_write(fd, iov, iovcnt, pnum) {
   var num = 0;
   for (var i = 0; i < iovcnt; i++) {
    var ptr = HEAP32[iov >> 2];
    var len = HEAP32[iov + 4 >> 2];
    iov += 8;
    for (var j = 0; j < len; j++) {
     SYSCALLS.printChar(fd, HEAPU8[ptr + j]);
    }
    num += len;
   }
   HEAP32[pnum >> 2] = num;
   return 0;
  }

  var asmLibraryArg = {
   "g": _INT123_compat_close,
   "b": _emscripten_memcpy_big,
   "c": _emscripten_resize_heap,
   "d": _fd_close,
   "f": _fd_read,
   "a": _fd_seek,
   "e": _fd_write
  };

  function initRuntime(asm) {
   asm["i"]();
  }

  var imports = {
   "a": asmLibraryArg
  };

  var _free, _malloc, _mpeg_frame_decoder_create, _mpeg_decode_interleaved, _mpeg_frame_decoder_destroy;

  EmscriptenWASM.compiled.then((wasm) => WebAssembly.instantiate(wasm, imports)).then(function(instance) {
   var asm = instance.exports;
   _free = asm["j"];
   _malloc = asm["k"];
   _mpeg_frame_decoder_create = asm["l"];
   _mpeg_decode_interleaved = asm["m"];
   _mpeg_frame_decoder_destroy = asm["n"];
   wasmMemory = asm["h"];
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
   this._mpeg_frame_decoder_create = _mpeg_frame_decoder_create;
   this._mpeg_decode_interleaved = _mpeg_decode_interleaved;
   this._mpeg_frame_decoder_destroy = _mpeg_frame_decoder_destroy;
  });
  return this;
  }

  function MPEGDecoder(options = {}) {
    // injects dependencies when running as a web worker
    // async
    this._init = () => {
      return new this._WASMAudioDecoderCommon(this).then((common) => {
        this._common = common;

        this._sampleRate = 0;

        this._decodedBytes = this._common.allocateTypedArray(1, Uint32Array);
        this._sampleRateBytes = this._common.allocateTypedArray(1, Uint32Array);

        this._decoder = this._common.wasm._mpeg_frame_decoder_create();
      });
    };

    Object.defineProperty(this, "ready", {
      enumerable: true,
      get: () => this._ready,
    });

    // async
    this.reset = () => {
      this.free();
      return this._init();
    };

    this.free = () => {
      this._common.wasm._mpeg_frame_decoder_destroy(this._decoder);
      this._common.wasm._free(this._decoder);

      this._common.free();
    };

    this._decode = (data, decodeInterval) => {
      if (!(data instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof data}`
        );

      this._input.buf.set(data);
      this._decodedBytes.buf[0] = 0;

      const samplesDecoded = this._common.wasm._mpeg_decode_interleaved(
        this._decoder,
        this._input.ptr,
        data.length,
        this._decodedBytes.ptr,
        decodeInterval,
        this._output.ptr,
        this._outputChannelSize,
        this._sampleRateBytes.ptr
      );

      this._sampleRate = this._sampleRateBytes.buf[0];

      return this._WASMAudioDecoderCommon.getDecodedAudio(
        [
          this._output.buf.slice(0, samplesDecoded),
          this._output.buf.slice(
            this._outputChannelSize,
            this._outputChannelSize + samplesDecoded
          ),
        ],
        samplesDecoded,
        this._sampleRate
      );
    };

    this.decode = (data) => {
      let output = [],
        samples = 0;

      for (
        let offset = 0;
        offset < data.length;
        offset += this._decodedBytes.buf[0]
      ) {
        const decoded = this._decode(
          data.subarray(offset, offset + this._input.len),
          48
        );

        output.push(decoded.channelData);
        samples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        output,
        2,
        samples,
        this._sampleRate
      );
    };

    this.decodeFrame = (mpegFrame) => {
      return this._decode(mpegFrame, mpegFrame.length);
    };

    this.decodeFrames = (mpegFrames) => {
      let output = [],
        samples = 0;

      for (let i = 0; i < mpegFrames.length; i++) {
        const decoded = this.decodeFrame(mpegFrames[i]);

        output.push(decoded.channelData);
        samples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        output,
        2,
        samples,
        this._sampleRate
      );
    };

    // constructor

    // injects dependencies when running as a web worker
    this._isWebWorker = MPEGDecoder.isWebWorker;
    this._WASMAudioDecoderCommon =
      MPEGDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = MPEGDecoder.EmscriptenWASM || EmscriptenWASM;

    this._inputSize = 2 ** 18;
    this._outputChannelSize = 1152 * 512;
    this._outputChannels = 2;

    this._ready = this._init();

    return this;
  }

  class MPEGDecoderWebWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, MPEGDecoder, EmscriptenWASM);
    }

    async decode(data) {
      return this._postToDecoder("decode", data);
    }

    async decodeFrame(data) {
      return this._postToDecoder("decodeFrame", data);
    }

    async decodeFrames(data) {
      return this._postToDecoder("decodeFrames", data);
    }
  }

  exports.MPEGDecoder = MPEGDecoder;
  exports.MPEGDecoderWebWorker = MPEGDecoderWebWorker;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
