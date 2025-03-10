(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["opus-decoder"] = {}, global.Worker));
})(this, (function (exports, NodeWorker) { 'use strict';

  function WASMAudioDecoderCommon(decoderInstance) {
    // setup static methods
    const uint8Array = Uint8Array;
    const float32Array = Float32Array;

    if (!WASMAudioDecoderCommon.modules) {
      Object.defineProperties(WASMAudioDecoderCommon, {
        modules: {
          value: new WeakMap(),
        },

        setModule: {
          value(Ref, module) {
            WASMAudioDecoderCommon.modules.set(Ref, Promise.resolve(module));
          },
        },

        getModule: {
          value(Ref, wasmString) {
            let module = WASMAudioDecoderCommon.modules.get(Ref);

            if (!module) {
              if (!wasmString) {
                wasmString = Ref.wasm;
                module = WASMAudioDecoderCommon.inflateDynEncodeString(
                  wasmString
                ).then((data) => WebAssembly.compile(data));
              } else {
                module = WebAssembly.compile(
                  WASMAudioDecoderCommon.decodeDynString(wasmString)
                );
              }

              WASMAudioDecoderCommon.modules.set(Ref, module);
            }

            return module;
          },
        },

        concatFloat32: {
          value(buffers, length) {
            let ret = new float32Array(length),
              i = 0,
              offset = 0;

            while (i < buffers.length) {
              ret.set(buffers[i], offset);
              offset += buffers[i++].length;
            }

            return ret;
          },
        },

        getDecodedAudio: {
          value: (errors, channelData, samplesDecoded, sampleRate, bitDepth) => ({
            errors,
            channelData,
            samplesDecoded,
            sampleRate,
            bitDepth,
          }),
        },

        getDecodedAudioMultiChannel: {
          value(
            errors,
            input,
            channelsDecoded,
            samplesDecoded,
            sampleRate,
            bitDepth
          ) {
            let channelData = [],
              i,
              j;

            for (i = 0; i < channelsDecoded; i++) {
              const channel = [];
              for (j = 0; j < input.length; ) channel.push(input[j++][i] || []);
              channelData.push(
                WASMAudioDecoderCommon.concatFloat32(channel, samplesDecoded)
              );
            }

            return WASMAudioDecoderCommon.getDecodedAudio(
              errors,
              channelData,
              samplesDecoded,
              sampleRate,
              bitDepth
            );
          },
        },

        /*
         ******************
         * Compression Code
         ******************
         */

        decodeDynString: {
          value(source) {
            const output = new uint8Array(source.length);
            const offset = parseInt(source.substring(11, 13), 16);
            const offsetReverse = 256 - offset;

            let escaped = false,
              byteIndex = 0,
              byte,
              i = 13;

            while (i < source.length) {
              byte = source.charCodeAt(i++);

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

            return output.subarray(0, byteIndex);
          },
        },

        inflateDynEncodeString: {
          value(source) {
            source = WASMAudioDecoderCommon.decodeDynString(source);

            return new Promise((resolve) => {
              // prettier-ignore
              const puffString = String.raw`dynEncode0014u*ttt$#U¤¤U¤¤3yzzss|yusvuyÚ&4<054<,5T44^T44<(6U~J(44< ~A544U~6J0444545 444J0444J,4U4UÒ7U454U4Z4U4U^/6545T4T44BU~64CU~O4U54U~5 U5T4B4Z!4U~5U5U5T4U~6U4ZTU5U5T44~4O4U2ZTU5T44Z!4B6T44U~64B6U~O44U~4O4U~54U~5 44~C4~54U~5 44~5454U4B6Ub!444~UO4U~5 U54U4ZTU#44U$464<4~B6^4<444~U~B4U~54U544~544~U5 µUä#UJUè#5TT4U0ZTTUX5U5T4T4Uà#~4OU4U $~C4~54U~5 T44$6U\!TTT4UaT4<6T4<64<Z!44~4N4<U~5 4UZ!4U±_TU#44UU6UÔ~B$544$6U\!4U6U¤#~B44Uä#~B$~64<6_TU#444U~B~6~54<Y!44<_!T4Y!4<64~444~AN44<U~6J4U5 44J4U[!U#44UO4U~54U~5 U54 7U6844J44J 4UJ4UJ04VK(44<J44<J$4U´~54U~5 4U¤~5!TTT4U$5"U5TTTTTTT4U$"4VK,U54<(6U~64<$6_!4< 64~6A54A544U~6#J(U54A4U[!44J(44#~A4U6UUU[!4464~64_!4<64~54<6T4<4]TU5 T4Y!44~44~AN4U~54U~54U5 44J(44J UÄA!U5U#UôJU"UÔJU#UÔ"JU#U´"JT4U´ZTU5T4UôZTU5T4UDZTU5T4U$[T44~UO4U~5 UÔUô4U~U´$.U5T4UP[T4U~4~UO4U~5 U#<U#<4U~U2$.UÄUN 44 ~UO4U~5 44!~UO4U~5 4U~4~UO4U~5 44J44J(U5 44U¤~J@44Uä~J<44UD~J844U~J44U$54U$5U54U$54U1^4U1^!4U~54U~5U54U~6U4U^/65T4T4U$54U~4BU~4O4U54U~5 UU'464U'_/54UU~5T4T4U~4BU~UO4U54U~5 U54Uä~4U¤~4U~U'$!44~5U5T44\T44U<~$6U\!4U#aT4U~4U~4O4U~5 U5U5U5TTT4U$"4YTU5 4U4~C5U5 U5U5444$4~64~\TU5 4U~4U~5T4Y!44O4U~54U~54U5 4CYTU5 4Uä~4U¤~4U~4$6TU54U\!44Bæ4Bä~[!4U~4UD~4U~4U~4$6TU54U\!44B4B~[!44U<~4U4~$5 4U"U#$544"Y!454U^!44<J44<(J454U~84­UN!#%'+/37?GOWgw·×÷Uä;U9$%& !"#`;

              WASMAudioDecoderCommon.getModule(WASMAudioDecoderCommon, puffString)
                .then((wasm) => WebAssembly.instantiate(wasm, {}))
                .then(({ exports }) => {
                  // required for minifiers that mangle the __heap_base property
                  const instanceExports = new Map(Object.entries(exports));

                  const puff = instanceExports.get("puff");
                  const memory = instanceExports.get("memory")["buffer"];
                  const dataArray = new uint8Array(memory);
                  const heapView = new DataView(memory);

                  let heapPos = instanceExports.get("__heap_base");

                  // source length
                  const sourceLength = source.length;
                  const sourceLengthPtr = heapPos;
                  heapPos += 4;
                  heapView.setInt32(sourceLengthPtr, sourceLength, true);

                  // source data
                  const sourcePtr = heapPos;
                  heapPos += sourceLength;
                  dataArray.set(source, sourcePtr);

                  // destination length
                  const destLengthPtr = heapPos;
                  heapPos += 4;
                  heapView.setInt32(
                    destLengthPtr,
                    dataArray.byteLength - heapPos,
                    true
                  );

                  // destination data fills in the rest of the heap
                  puff(heapPos, destLengthPtr, sourcePtr, sourceLengthPtr);

                  resolve(
                    dataArray.slice(
                      heapPos,
                      heapPos + heapView.getInt32(destLengthPtr, true)
                    )
                  );
                });
            });
          },
        },
      });
    }

    Object.defineProperty(this, "wasm", {
      enumerable: true,
      get: () => this._wasm,
    });

    this.getOutputChannels = (outputData, channelsDecoded, samplesDecoded) => {
      let output = [],
        i = 0;

      while (i < channelsDecoded)
        output.push(
          outputData.slice(
            i * samplesDecoded,
            i++ * samplesDecoded + samplesDecoded
          )
        );

      return output;
    };

    this.allocateTypedArray = (len, TypedArray, setPointer = true) => {
      const ptr = this._wasm._malloc(TypedArray.BYTES_PER_ELEMENT * len);
      if (setPointer) this._pointers.add(ptr);

      return {
        ptr: ptr,
        len: len,
        buf: new TypedArray(this._wasm.HEAP, ptr, len),
      };
    };

    this.free = () => {
      this._pointers.forEach((ptr) => {
        this._wasm._free(ptr);
      });
      this._pointers.clear();
    };

    this.codeToString = (ptr) => {
      const characters = [],
        heap = new Uint8Array(this._wasm.HEAP);
      for (let character = heap[ptr]; character !== 0; character = heap[++ptr])
        characters.push(character);

      return String.fromCharCode.apply(null, characters);
    };

    this.addError = (errors, message, frameLength) => {
      errors.push({
        message: message,
        frameLength: frameLength,
        frameNumber: decoderInstance._frameNumber,
        inputBytes: decoderInstance._inputBytes,
        outputSamples: decoderInstance._outputSamples,
      });
    };

    this.instantiate = () => {
      const _module = decoderInstance._module;
      const _EmscriptenWASM = decoderInstance._EmscriptenWASM;
      const _inputSize = decoderInstance._inputSize;
      const _outputChannels = decoderInstance._outputChannels;
      const _outputChannelSize = decoderInstance._outputChannelSize;

      if (_module) WASMAudioDecoderCommon.setModule(_EmscriptenWASM, _module);

      this._wasm = new _EmscriptenWASM(WASMAudioDecoderCommon).instantiate();
      this._pointers = new Set();

      return this._wasm.ready.then(() => {
        if (_inputSize)
          decoderInstance._input = this.allocateTypedArray(
            _inputSize,
            uint8Array
          );

        // output buffer
        if (_outputChannelSize)
          decoderInstance._output = this.allocateTypedArray(
            _outputChannels * _outputChannelSize,
            float32Array
          );

        decoderInstance._inputBytes = 0;
        decoderInstance._outputSamples = 0;
        decoderInstance._frameNumber = 0;

        return this;
      });
    };
  }

  const getWorker = () => globalThis.Worker || NodeWorker;

  class WASMAudioDecoderWorker extends getWorker() {
    constructor(options, name, Decoder, EmscriptenWASM) {
      if (!WASMAudioDecoderCommon.modules) new WASMAudioDecoderCommon();

      let source = WASMAudioDecoderCommon.modules.get(Decoder);

      if (!source) {
        const webworkerSourceCode =
          "'use strict';" +
          // dependencies need to be manually resolved when stringifying this function
          `(${((_Decoder, _WASMAudioDecoderCommon, _EmscriptenWASM) => {
          // We're in a Web Worker

          // setup Promise that will be resolved once the WebAssembly Module is received
          let decoder,
            moduleResolve,
            modulePromise = new Promise((resolve) => {
              moduleResolve = resolve;
            });

          self.onmessage = ({ data: { id, command, data } }) => {
            let messagePromise = modulePromise,
              messagePayload = { id },
              transferList;

            if (command === "init") {
              Object.defineProperties(_Decoder, {
                WASMAudioDecoderCommon: { value: _WASMAudioDecoderCommon },
                EmscriptenWASM: { value: _EmscriptenWASM },
                module: { value: data.module },
                isWebWorker: { value: true },
              });

              decoder = new _Decoder(data.options);
              moduleResolve();
            } else if (command === "free") {
              decoder.free();
            } else if (command === "ready") {
              messagePromise = messagePromise.then(() => decoder.ready);
            } else if (command === "reset") {
              messagePromise = messagePromise.then(() => decoder.reset());
            } else {
              // "decode":
              // "decodeFrame":
              // "decodeFrames":
              Object.assign(
                messagePayload,
                decoder[command](
                  // detach buffers
                  Array.isArray(data)
                    ? data.map((data) => new Uint8Array(data))
                    : new Uint8Array(data)
                )
              );
              // The "transferList" parameter transfers ownership of channel data to main thread,
              // which avoids copying memory.
              transferList = messagePayload.channelData.map(
                (channel) => channel.buffer
              );
            }

            messagePromise.then(() =>
              self.postMessage(messagePayload, transferList)
            );
          };
        }).toString()})(${Decoder}, ${WASMAudioDecoderCommon}, ${EmscriptenWASM})`;

        const type = "text/javascript";

        try {
          // browser
          source = URL.createObjectURL(new Blob([webworkerSourceCode], { type }));
        } catch {
          // nodejs
          source = `data:${type};base64,${Buffer.from(
          webworkerSourceCode
        ).toString("base64")}`;
        }

        WASMAudioDecoderCommon.modules.set(Decoder, source);
      }

      super(source, { name });

      this._id = Number.MIN_SAFE_INTEGER;
      this._enqueuedOperations = new Map();

      this.onmessage = ({ data }) => {
        const { id, ...rest } = data;
        this._enqueuedOperations.get(id)(rest);
        this._enqueuedOperations.delete(id);
      };

      new EmscriptenWASM(WASMAudioDecoderCommon).getModule().then((module) => {
        this._postToDecoder("init", { module, options });
      });
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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode0095	%j©Ö¥Õ= [ücò¬qrØÍTÑ®]µ+¡]ÚÿKM&ìÃÅFJ´õ1_§= ¾A-T¸½Ê"ÖþkÝä8Äå¼?ÙqV2;CÚxC:ëañjk©(4'êÅ<i)+ñ¸+ÉFÞA+yDÉàXÕ¨Í.3(bÝdþ=M»×
ï5Âõ5UÅÜ%Í=}8}y+-Îµ¥}£çÙ5-'ÑN¦­­Ù¾âX¥83sS%6Ôþ¦²¦XàQvh_7ï!ÈÍ ÈÍHÍ¤rMMM8M!%SWÈN		"Q+Ð£±ÏÿxB.IíøÿÿL[ØNèÛ£ÿ)ø{}Ìk Í=Mu¯ýiòñAþ×Réª=}ëïÕ+þ»SPHæ,P¢åz2ZQ= )U¨­¼ÆÒZÛN<q=}bè0æ,<Ã8ÓäÛØ3!1¼ü	ehÖ883#¯2	g}A<HÛ¬ÒòÉOw~f¢äÌ	GÐàjùj^Ä@iÁD R¨pÁ?4é(|-~yLJêçò3PÞ¸QýÙl!¯tê	Xïx°vó²´\F:prhÉhr8ý¹X½k>CB%²2CÚ£Ñû{lÈ¬yÝï#=M®QaQa!ø....®CiI\£±âêì2Ïé?O;~À£Ã½­´Ýân3Ù»öôáq±Í»»*Ù{@ï5/Ã[Ó&éè½­RmÙ$W}±ó?áÏ<"ø¸ýÑÌIu"«\Þ=}LÍ¥ÅèU=M1÷Æ#¼âöóKÜ¿@ÐEÄ#í=}XÒòv÷5^
¯RGÑo³fûAâBâuOðËÜOso±ª®tþ#ñHR¾í¦Êó@ÐÆ=MQÙ0ï0ñ°§¬+rêTðdeôNØK<0êäR%åÍô#µfÐ9©Û8]¬¨/Ë ´1oË2mu>%Ý>HX$¾ð©¼ atè¡eËR«/ÃSÌ(=}ZË1qåè6»3@¥t Å²£wsÅ±ÛXö+°~ÅâXÅ¢ÑÀ385¿Põþ9õixÅ¥êm¯¿zÄx÷_VðC¦ÝPêp=M@#)Lï£DëÂ= óíy°¦?Y·mÎÜø(}µø%ÌËðÖÔkN"èb{Iã$ÞÍtN9NóýkÙPý/´¤ûÂòÿl»XÖ ÷g/óTànn3-©i­9×ÁI.´öu¢ G¼X¹ö7¦t×]é¯à= yâ6§Dû×ZDæÌLës©ØäÆ§Ø+pªE9¡t©ò=}}}Û8Ä&ÅÛlÂaÍ¿SÈ cx#-º\P>~ËU¡®©Ä oÙ¥_\0¥ðùßüpTÔ}­äX»qNYÀÐ=M0ý@Þ­­.âátv&÷¿Lg¯I-ÒüFðÄø¶¤¢/:2{Hdh:f$´mD.©qk×¿rkí?Ò(ÍóçoGV«¾Sa[±=}+'	{¤¸»)&õf³)&Ue¡]àGÀ%W=MIèÚ=}ÎmÇ= ýÝ-ye)Gö^*;½]- ó­ÿ§³Ú¾U1)V@Dcj§íV¹)= 5ÓÙPVÐÅc=ME1fÃêf¢á´Õñù¨La[ÈOÿ+o{Ðè0ßeX¥Á×Þe-G<¨[.>ÆtXç·qçkû<o
´!aiä§ëëÓÚ$üÇ|ðè'=}ç@Nª9Ô¶Óí·^ÃT¾nzL¼@ä¶«´çx(ÛÓsÝ2oÅÒoÝ­ôI@Òði= ¨pläÝº&&8×c'²»0Þ= .ýLû3q¥Øü	9Ý*¨f×(ôfX©¡ùÒ¼Ç*»z"Q6À3Ö¤s£órÆÑªdÒ4?W¢,p= ª*
ö7{ÉR{ûþ)¶{lKÂ}à;gYáêkK§Ë<\¥[ÉÜ÷0QÕô×Fõ­6\ä¾Ê¬vûìw ^e+ÞeyÊmÅdJÃBl}Æt E+FÂ (­ãUw»=MÅ!é8~SÊzS= ¾µ¦v<úÕO("}©=}0t¤<ZBÛzÖvå!á&¸ 7~¶»@ÙªÈéôúÄä\¡mèMÙøym!Éé³ïÝ'Ë¡,*)õLäàRóV£Êßøýåjá_«Kj3kkçHÙV´Ë 0F<ßç$Ò$?µÌyÕ9-ïÄÁ¥þ.Çÿu¤;eGtÛ	©h$ñyN£¾}wEî ÎoÏ+-=MÅ=M9BÌ^ÄÉ^4r éjr °ù62-0bpb¿pF¾n)»¼¬a¡sLÍÊFd!!ÎÝº'ã;»¼qþ(=}JþHS¼~#Ö+ó³üÌÖùê¹XÞ|¾<K9÷ÉIuÇöGÞrÔ)YfPcskY;-YtË5= V,P¥1ß©Òî*»¾±F¶÷ÚîÿVè'©v[ª\Ç-uyÂ²± ìMËÙ£@¤ælP'ñÈ«ºôè¯¿ú7¸(t¶×»Qgf Ö=}çç¹iøõ6tgðJ®jWE®pD´I2ÎÆØÛ±Tÿÿ~øè ´W;hùÊ²5^/¯osÓE»gÜ	&ØzôzGe¶Í¸îsáÉ°o¼"ãÛØ§¯­MÞ´/¯N{½0Å»})r¿öX[i¡j,ÿrÒ¦Àö²Î1á"º0AGf!48ÅÏeÚçWêbÞGÁ5ýìmü0°-ôñ¸^|ÓÂtw°ûj¦O7ÓvYt¬¾àcÔ©OàÂÍ3ÅÛZÁN}î¾ùjùztsÉÖNnPkìN¥ú£hÕ^ÒxÜ¨*Tß@4!¶J´ém¥.m%ÍÓlC_¢ßÙ#_b°{$QèíÆq©>ä&¿§ªòéµ%$Â¦DÕÿP·ÀÌ9»ìkþ¹É= 'Wå"ãS°-XÚõýqV¦E×UzXMx­âÝí£tI­k_m¢×T£L8q¨TÆ= )ÿ·'Eê×½X{sÁi»3P6Ku«Fù[·À_r?ß*8óÂ·å¨õY^Ùø¨^fÅeáôÊÂ>ÌÕÞD¼õíÁ6C×åÈÕW&T³bUrâu.¡!gTÏÞC¨Ô\Í~a×»n«ÙñßÖ¤½ôuqgñ ù7}r"IutòÝ F"A-­Õå+º×9Ê¬jÜøõW"ÎQ5\T×ríÜ=}B4+_jX>Ù¡Ê}Uù[øÞÓ£ÍæàIå_{!¢qÚõ@ü2®>(Úg{ôÜ/^T5TXµ10 ¢ù³õçRÝSâg±ÉéõßPí=M¶"°A'?ì»;!=Mær!³·%søsÃÏ«+±SéìÀ°©ßv±%¥Ie¿å×
ÅZÌèþ©=}Hg;þ*6A+s'0Dùü\ûwÎ.0LP"'àý¯ÐØÙýÝDH¨pt./¯öO> *áÂ4Çr0ºLxþï-SëÍù·
w>LâR´elâ¼7ââ^7¹ew'ê¦ÎÒ¼¢åÆX Ð5ÕRQÅÖ.OUïa!aÉ¡1ÏXÂ«¢ìc ÒÅÂ@ Á×HOJ#Hc¯R= ÍË¦ÇFN×ÙÑ0o Ùq[MjAoÿQÔô»R²Ky¥áñeNRJ^!ÍÉäæÌe6Òs|sP3@Eú;þë4õ"éfÄóà~À,ÀA=}JÆ¯öL;Ä
ìçÆT#|jQCvò$µ;çûvSÜëfÅëó?=}lôä"¤éÒÁèî¸5x¶©ÑCúÙµE"Ýãï$]D7ÅÕ¨Å»5hP³c?¤ì9Õ¦ìÙf?sR¬~ÒËÒºEgÑù¹¶X½ÎÓ±ÑÏªn³y!= 8Â(ñ<[µ{$.q^o[Å:|À|0»¬oÅÃs]þí£EÞrXËté) ¶K9-ñT[rCÕ}vN{Ð5¬m)&ëÄö0±RfyuAÛ ãR= Rä¡rwìòá0ËT¯Ie
=}­Ï\H¦üØaòUÝÖW9Efüb!¿·(Ø¦» óx®uL«G ²Ä k;Ã6¨1<½Ý[[ê[¢"qR_öÀRØZS/|2bgM#Ò ÀÑ}÷¦¥ ßMëÓx¸cÎD0ò¡±)~<âã¶æV4&&ø¨×R~Úëô=}{<¥~9}VÄj¨Wã-	Ó©Ðì®<È/UmE,?ÈP3#­Ä²Þ½ùÜÚ#íÜ<¸¥&ØçAgs"Q »#9Ä-Ón!=M!	\	FpÈâdÓIZ¡ÚöD}n¸,ÈâIü³ÕÀQÀÃËÜtrû ×Ñâ´ÊÃV$Îà!KF#»¬ë¯b4KNYb³bUñ *56PÃEaËF-m:XÁüLÊ>ìrrÓÂ-ÜeG· rL¶¹É¥P°kW8Nª0Ý·¸ÃáavÇÀyS{|H= Ödq¼¸!ø¨³U'18²^p¨¡<#H[³E)e±+Ô¶òÍ= 5ëº!¾éAÏ*ôaEî§8RAÏ¬AyÎ²Õïs®¿é7û{²Õµ#È=}·¥B<öMÑQ¦åÃÇ9= zÒQzón"¹Cc§e±|×¦-VáéT®[NWk@\ÛÆ%&³­Ína»2b/EX,an8±ñ®«Of	Ãò,=M¿Îud×Ía
y£¢^ªUÿÿL¬é½QC¤ø4üc¨s"â¯K¼ÑW4:Þ÷Ä\bÔôcBC+1Æ·O9´H{kHÂòÄõUïØpiBÎ]¶ð÷³Á$yö/EoNô÷ãë u<4%áåc­Òø§Î[,l¨Î×áÖ~Ç7+Ö^ûk§PÜ'Ãi©QDÌ8´T½¾bPñðÔ©¢&² ·ÓSyU\!=}+= = &úGoæ\S:b¬Qû-\G¯_í<Ì&^ã¦ ®ÆÁÃe¯ö³b;ËxÀªW.^EE;Cr³MyGù|70É8ñ8{ ²ÎºíËÒ0ÊZ	-±myAVsc{M)6¿8ë+îÊ^ñôÛÇÑª/ÑXYa±sNÁØ¿Ëc¼!¹­Á\Cx_h8Ïq¢ãÚÊnäÔãý»o´CõªÕ{´PoÅå¶ïá7ØpbÄgcBÄ NéçÃRrp1 Ü9°E®uåk¡ûÅª2Â¶2yýªj>wPOtËÌX¡zÙÁº¶{«+'PÌÈ)«»¥æ¦¯¦ÐØ@£5\¦^= Öùònf¼Ü]$Ì%´dÑ³r%ya«Zôô*Úå¥~5Üv65P6NÊÔD^ÑBÌ^0	»× þ*ª«Åd1~E+PûÁNo&¶#:P+Íp¡Dß}[¹AÞPÈõuça¹(:î ¼¶3Æo_=MàïE04u]O¡³Û=M]i¥²û×Ñ´z]­^Èb´1VÑ9ÄpùgqÏh_®Þ»Gqy,¦ZSyßèuA/¡ÛÉWGäSDÜ6=}Fõ4SvÖèøºøiþ(b¨ÍàMí¥ö©·÷?I9ZF×T£*j×ä´Ö÷Ô"^£án= ó·|Ýñ±9ÖP¡ [ç/kÉÃÝnÅhHþùøC ·û5üÃ=}´S}Ã|®áÝèÌ?^hôipnn«Ts0xøÓ½GÖX°ÁÜ èë²ãg<bBÄû]/Î¤jV¦ØÓÉ÷|ñÅ6¤ù0ô=}Ý/´J»c1h8ëW¯ß¡Qi'®ocdýC.¶öi¡BùÆ´ù3±gÛp¸ex&shg|ÌZ9ø[^ú\c¹jT¡î¡þkQuX¡*öÿÓ	±
, Çmî%·>]HBÍ°¿Jxö5­{T1â>(éÇèSº±nzké©«=  'ÅxÛa¶XtAN3Iô*HuøÅl1×±Ýî©EvÆýJ=}Ï,ÕîömÙ|ð£í"»*ÚFé¿oeõö$Q&ÛS¬­@j±~$Îàgi#ä³jªuÆB®Áj<WT=MÃO3ýÐf,»Ë^?·>£ÞÉ²W¾h´Ã=}Ó= ¢ïüÔ+~ÅM\é_ zan= 0±Th¡´Û>æÔâi_õF£°/D¡ªE58z¡ý´gñeMut°JÜC £Q6)e¨=}¡q³^
óYcïi¯ÆÇM¹ìDÎ= ?hLZ5 Ý£Êhî{WÐ/=}Å®å3ùâ(XÇDö½,¦îkÈ)GÜø©_Ltc=MÁKUm\ÓH#;ù9äèGÄgø@ÆaB2õvÇ [4RÕ¦¸â¶fúØüd:d\ÌzK»,w¯¾2wZÒkº~Ó¹ÈËz0xºAêXrZ*µÌ#äö¶ÉÛ$ËÜÕõ| áív£$ËzÞzGé-½06°|&gåüÿrïá±¬}pVÂ«/L>·¡SêÑËmÆõRt3mJ ±ð¾Ó^6ùhî2DÆâÊÎFpù^°bAöAý m&óa|ÇkEÈþ9J°é|»ç1À\ðOTÒ-o¨eÛ0tþÃ	p-3= 'ÇaBÞ¿!â^»GhODWñÁï8§<Øif¡{ü>/ªçRèúÖvÔÁNä[ïÜa/D]¦h­þbíãMzÓA¸@;%çåÃz:éóß¶PÈ'L;õðß= çY8H®t*ÌXò^ùaPîá&.»pQZÊ¾?+PÐit¬»ùY6yÊÎméìÏ\:÷éñXØIúë¸oþ«GH®äjVò¶@,i#6£HÃÎåùy
H Yù2/.ob÷×m¾+çÒ|ÒB±¼
îØnËr (ôbgà¾ù¨Oãzérò§¨NrêÝ@öóklùÍÑ'¿Ù÷[u((ê4|¼æÅ@°ÅBz«%dÍËâ6Òª´´w9ñ@¾RíUa¾/°üÊFé)âÉÊ$_Ïj½®EµKØIº5dú(¿fL c%ËUÔ×d	±Ãñ\ é§CáM}phÕ$×ë½vßxÑ"GÐâyqþ^ÒTÅ91®Î²Xørdn0UÖÓàvb 0§/YnÎL}µç×=}ËÛzá?³ð7|Ë)pØói-íL9cv ÓõÛ¦@L\w&søñ c7Ï 0k\ª¿>±~ñëò£©«}Þ{}ÜíÚäy[¿Þ±¨âBàd4Ì¥På&l¤øÕï©¤Ø½:Ê\0^upqpxX}mWRbfêË4|[IåÞ^ænË4ÑPü*ÞÀ* (çá?¾ä»fÓÌ.é1Äw§.ÝóÔA\Vá¾¶ýe»ãZx¾¡4òßcôj$	Àrè¶= fûÛ6ÝÚ[ª\ô#ÌPÑ^¥c(%^ÀêE´d0dÎXd¼0ð^=MCÞ¼eõ[Ëº\ÆY½4öÄEÐàm²eþÛH(F¨Ç;lb¥ÞPªÄà6Î$¦~Â};8øÕ-ÅÃv÷á=Mõïr/ÅÊbQª>­/ä½LÐÆî¤ìÇËÍdè¦WÕzL	.ð¾X¡{ä\ó(=}ÏY0åé=}dSÉ
âk,*¾|ðÍ-6åé«r|=}"î]ÐÒÿãeæ8E¡ö½XµLüâ6qY;±l'\=}0ï\iÏ¼ >pÓÓ[Íø~Lñw®K7»&6oÂÙ¢rÎÐó	*@½TrÞpìì<ÃÎ±·ôË®í_&´6K>/9ÙSÊ¹»çÖ<-Ö$k´ûbÄd¤Örß»×â*¿ÁÈ:¿Y±|®LdÈE>NªiFÆdåÉä×ükÚ¨.,6ñoU8m/(uTÐÐB@ý«dÁ§0	 ùÔ÷Ã|q´Å¹CWÞ×üäó\b~C@Ü_P¿RVw5ëûç}ªÚw?&;/«þ¯74NbYKWjõ|U±¡uú=}ëQ».otä ¹îÞÝþ áªeÿS@æ:m }½lÞuÆ6IäNÃñËæîë2ÁÎwt
<-Eh0Êúoc~hôP=MtÜ{õþN¼ÀÂ¶¬)êF1T$n>(GêßVã_ê\?(:('I@+CÉüµ=}êûêÝiíôG®ÊãWÔ;AhèG·«^?xÜ³KÚî= Í8+lisjúÖÖ8V'ûD«Òµÿ
³ä7cÙHPY$ÊT²ê$ÑªÞN}ô#{ÄÏÏCÖÓ|é¬Ríi÷Pã[9çÞR¡gÿO3vØ3S¿Q /ÍL7åÁ¹-	o¾ÞyI!= ê³£Ke=M÷×
yCrËQ³lc=M?Sò:ËBlûRáþ~ËcSó0Gsy:oH3c.òþ<çTjç:D]Þ­ïpL¶ÕÈ**ºÎ~£#<W$wÑýÐ @;½éQUä×ïC-ãaâu<-*©ñ\2uÁÊ½üãóE*= z,ýÂ_LÂÉ-³,JGsËÎõí¨(FÜ»ü¤á_{.¢Ë\Az4ª@45èx@	<J.AÏæe¸¬5²äPn"î<fh2~I0Ûlä,;¯òÔòt.cOþ	ÎD¯u	øF-8Ûõ¾õ°¤-yÈ',Û-gdÀóôf¬ûâQ3»bU.hÀsaÀÁà$Ô/Êøn±È<m±Æ$FîÊäE®0¼n!aþËJbeÑb;ÉdE®-üny{±0iÑd»Ë÷¨.ànðw4¶ÔÀÛÔzÚHöË¤0ºËüâ[{þ(Rß=}3= ÈHBÔjwV~d}»óì,|,5[×òç=}!XJf
Xí[ON|PÎ	rq§dbefvr'â{3{e
Î4.
F.ý9O0Ølb:±ÿ[£f2ÄÎ÷rq~£òc.i^ñLSgÈâó·bílÑnBÖ#DkN¼OÎ	|:cÒkb6Ð4= 
éÌÃkÎücÝ1ð2
ÐKÄðn|Ð,ÄËð¨eÔ+ Âf9BReMD[Ä1L¦«GÓôumÊ#ªË6è)G×tV	}#ßÃUó¶Ø £¡®Ç±rS6ð¨0#2%ØzàÑZXË¼»P\Z¡ª"=}@)#^Þc3iÿ\Ù?k²÷GYpGÜîÆî®©Ö¶Ä³tæ^G±àI¦û=MÀ\¬¬%qXª´|Z/âÖ fq{SÞë'ÅÄÜªa´+â¶÷+é[øPÙ«=MÄ¬= 2ô)S#4 SñáÌ«
AòdNãàíå9?TRJÑ£Ø$*9ãàoÅ;y­ôK ,Ïãùm¬957ê±å×ÂiV	>Z"ôKEFÿWÑ¾®Ðnrí|®fOê©¥0+p'afÆÑFiØb±íq'jNU$?uZ¹r>+ûdq3²ùíðF­äI^ë¿ª®ä)­»!:×Õà«zT¯Rzfnëáa.09M|½ >%ìÐ= µs2å?"5>rVÔ­
Çô	#î0	}q,ü1
,\jª³¡0HkGÆ¾7ï lÈiÒð'fÌ¬qzÍ¼Aéè{Zù?LÎ¼0Ðcû¹jCkÕt(sü/¹V?9x¢	íw|»úÈ&Õ¸QÌªsËs£QqÌÉúïù¡!3ôÜ¥Ýi=MOHi¦GxÄiIG(D9±ñ'ÓBSPµ>p<õº31EKäg¨u'h/9äý'óh¹R7ÞM»þ8Þ9»~
âg0/9´j¹RVû5>Ólé4ÿ?$ÊjÜ/9
tüÝî¦âgW¹òGmùc/1bh;??É]HÉ}ZØ¢U.7\ÉÉSÀ¢z/mîaÕªèI0Ðjb6¼@pÐ.pàËÊ@D}ONçÐ/Oº÷rq8r±Oçû,wejºòó{ej©Übþ9|üÉÒìác|Å^ÿÐz1W4uÇrñ>\PÎ	
CàdÀr±OÏl:|J£rñ5¼OÎ	tÁÒ</3h¡%hÃ12¸C?J<ÊÜ4k±bÕä#ÓbÆbf;'çfÎ#OYjEPGëÐ/u÷= ªáÿß=M3¼N,TÃîøkBTU~Z,ðÃ0,­c7ÛÑËÒÓ) )Ó,ëÔúÔuy?CÑQóAì?OôLOðrò|Òù¡GùU-é¥¯üc(ØêÈÐ'úË÷x^üf3±n±»|"c{òp= y1m1Ò{dPòê"n}OsR|3Ó|ñÙÝµõîÈJ óûçA¢|M@ÑK{éPDÏäosRÊµz|º?Y¥ïíYÿÆkê*»ù_(öùÓd"tDüËá;.3ÆÚ¾è½2~ÿÓ=M /ñ¢1"j/ÀÆë +pGÏ[ÊxÔ´DóDK3oS\Ö>/lÉ¶Qü= ì«Ó2×èÍÊÔ®ÍB¢QçqèÈ8Zb¼âÄW3*¨QñÇ ªu1îÞÉmÄs+w÷®fxÝÂÉÄ.*~¨ÔWTC3È·Uä³}ï´?÷¿0¯¼SàORëuôV1
RÃqÅ«óÖ Ôµ´áÀß.}Mv@uì#]'Ì.ÇçùqÒï5À(9Çë8á#gn6Èº¤è!w;1 NÅj Ëù±oP"H÷ÃëÐØdEë¿wM¨9µluW.7¦ÿhÓûXäü5 	w=}>Ü*Qf¾ð9ÛÝ*ös÷ÄÃÃãuÂÄ#4rëâ-p%©~÷<EäAÄÅ)¦H:CAtÈ]Ò#¡Á1¤Mÿú{M;Äò%®å:x¬ü²à½'å1ügjéã¡âB>:ê¸)1Øå<BKãö£ã'Wj½óÊPì #lÛÆ16[<Z\g±ô¬\fÿ,ÞHÅ]Â£·-¶¢ãRj6Og·ÓH³EWc½Tv'+$ùÜ-= ÎcT¾ÛÜ}®¼Õ	ú¬_ÅÞôyÃy]ÚÈ©MmkB¤¿ÿ°é¾ËÇ&Ç1ËÂÁØÙÆg?teÔÒçá}ôw{_
áNIaY#ì×'}B}Ïi©BÑ§GcZ" ÿ(©ñ¿ ×ör9ÚÑ6D6N ô×ê35¥=}Åì[G¸*r
êù±a_# úKik<b6°?t4z½
hZ1O×óïzü?<gàBÖØxTó¥öAr^	GÛn¦É2iû6jÚ|CYkºßþxvû^ºøt,ÅãÂ
9?ó
î÷E\³@ÎõO2sfuST,´êZÅú@(nQ!"8BÑuÞ¼=MQç4Ù¶v(zzTt®êRÆÙ¤¹«Ô¾ýÁDá9ë×§gö¢%&þÀ¡Ò³ér;$Q¦9u»:°
¤[dYj¡a« ?ì&Ù
thI¾wÚMû
q2Õbö¡£+'BÅûÌ7¾õòú}·I/	i¡;L¿¦8/'.v~XÈ¾³ÛDkÇþ¬ÏgqBë?;N®ü@bSb%'8~	æOÓBP)±¥Y.Ä:2½(ÑÙðWîÁVÖJlêPì0fªðñíY»ÜLkäåvx.ýç¢ÑgÚnT9"ÛÚ£8ÖÉòwvVûàNGï£9ì?ÅgÇü0zOºQûú _­<ÉMñ$úåRâG$T'= Ì¸vsöò"5ù¯á@r°W³(ÍÛ®ú½4OÚ¯lAÍZÍ
ï¾çU^ö±¢½ ÃÁF¨·á«w&?«gñTËyêqThMÍ®uhæí¡=Má	è¶6[¼EÑVßYG*µ= *ÿÁ~èÕ­ÎX½(»6Éá3KÚ¨º=uØx¡C­[A¸{ª¢¥Å·¤¡Ê¦L$4ráVE®Ò·ÜOoØOIBiþðÞ$³±ÛóÊr¦c¾gÙ¿ÁJìV¸â-Öj)·,<¥îÖ¥ÿ:Y08å¼ÕOó*Iÿ@Uêiý?{½ä÷ÆöNìÈÊã$)S8«NÄýõÎí>ÁÆÛ©nì¼)ºÂÔC)ER!ôý&û*ÀAj,ÃÒFCE*þ¼Ey©ÏqÞÜ=M9åRfÐÊèrÐZ?èTnçGßyQ{´CtG2«vy,LcE iíV÷¸?pVDÛPæeãÍÌTcÝ~Óµp=MýiçÞ+llJS<ÇÊP-É\MíÂTÅßùD$·ÑÛ÷î)þWâàSõoÙä=}Ý¨àdgÿh%JFV6I®N2Eø+åäê¶ÓÌà öTÃO©á%u|ÿ)íÑrþïÛhÏ¾È2ùÇ¾ø^IÂm*Â",<q±ì$£ånMIuoæ!coÂèåEáòWnk¼1Ã'ºÍz=}Oj|Q¡öÆ©4\=}(­ý&|ãÍ= j´å4\ÏBS¢LC,qÅ¦¬UïÎÝ·5ÂÆtÛ	ïÖLZÞón*ÿ}GêKO RWF¶zÖNÙú7Ô@ýVñ'ø²ôÕd0Çä¥AËæõ)zl@;¥ñý1>¦vCRh
´JõOS  {-èäOAÁ5Àë;¼jî[_5 À!B-	ZùU_F£$l²ÏcFsáMZmþq*Ùà}³ÒÒ<ÇÜy³åÜÉ ¬»ÖP-ã±¥}"²Ç£o('ö¨~Yiô|u$»qÂÜÐ¨Cd¦jÃ/Ñý >È³Û*4¦ZBjba'?äzåõÖ¬ÏÜ¿°+ÑQ{¹¥Odl°h P_$PóÈÜiÐ½Ìª _ù«SnM9Çod¹ós»<ã±T«¢ e[ÇÇú¡ø@#H÷ðÛAæ@xZ	óãÆN°]
î!Ï7Ì[æ^§[[ÆÊòU]ûïëKç§£ºÎ8Ì#ÄýØ/B%<eëÈ×XÍ+i#£Å§-Æ=}È"·láÛ]¤q4E©þÍ«yx[gÄ5=M×EûwýÕÕÏS 9#,ÞÃ¢mÍª,ùíò×n9ó¯¬=M/ %oÝ\Î±zäZæ»÷È%Z¨.%9/Q!á[ïÇ¦ùmHN<M£Kñ(j£ áOWÉKs§ÔâW}ÅÆÕÒFq5U2½q¿èãÀûçÛ¬­©\,í­Æ;5#!Ö©i¨³O
9ØâÕ¾@»Wj÷6Ö)*c#ØQÁÅØZæ¶rÙ±â?V cOó}¼öÄ<	2¬<x_¦KÁv¬ºMéÓªÒn_Aô9òÈqøl¥u£ÁõåcoB¯<bçç©oq[¹D÷	@ 4µDððC6ASk·^µzK·ðªXèÊ«¸UAsÉÌjtì$·Ø0R\³9jf;| Vý
ékÛ0øíºICióÐþ³ÅTª6é#²Ü½;¨§Ùx)	+×1Àº&nl×¥Êr1á!PÅªuÎ<5®÷¿	öCUß±çqÐ2hÕÏ@>Ärù?ÊFÚH5}Dj-{/ìç!æ{îAû*ô$­#è=MÉ@[(Å§þã6¨#«M1N¯m+k2öÜëÜi,!&"©x­À Ì¨Ø¹!|§k ÁB#°Ýd^{;ßfsý½	l+DäG'))!Ú±Ká»³³Pþé4ø'bûîl³ßE!ÿóÄx¿[u&ãímG©x?é,BÎ/§+OQ~ç½áèøïmN|/Ü¦ò8püjð«¸~gÀ°nO£ù"X0¢#Í«òÊãv×üøË'ÀæGi;ÐÕs¶k¾70ÑA£'øQôö:ÀÁÈQ4?Ä%ñ»K?(«CqSÂ#KlÁW®)">b¡^¸»-î«w5ëK®M¬p·2Æ«>®Õpäém«äÝ3G0]DF=M»í´9;Dg/xÛúJäjðx¯Ãù£ÃÑ~úFZ£Öã®ê¬®ùíbdÂùöðßIí¹uóÇ9Üh#qZ'~Qéf$íÉÀÑ íòF=MÇã@dJ}´á3öÒãÍËFKa=M©B=}zt4ïâqªÓO@:ZÉgnÙ&|MÖNÜñWU8×²´NÔÞ£j3>¦ëkÑw»­B%øb8Ö¶³B&{¦: l¾EÕu8¶­pHY2Üíj5È=}tÞ<=}tÚ¼BtBíT\"B&Xû©Ð½£pCRh³nJ±lsø|,4e90Òï8È85øñ %»IìLjé­Õî°¦HË>ÐÁ(»ÜC.Ë°r5´R²=MakYÆFÓq¹á$¶t$>$ÆR5B¬5ÄP6ÒìÖ¸eË%^ð7Ó!&S®8lá?l6ÖòX*ÖòOÜr,Çð@l±áqA¥¢è[¥j%dmÇF*°î®7×Ö|Û -a?]ß´Uø\pÄu¬ôÍ^u¬-xà
îõ#{±QÆR¯=M4·o~NNz+t"¹­÷N¥ë#«*JC#	ËeÓÿÐ1®ð¢¬X ðx|ÈÃÈ±>¬õ­w%	7cYºÍ×àn£MU°$ì$8"ÀÁ20æ£²¦@<G§âÆQgóâßÔÉzítwL!c;â=}Ê~Ó©HCjM_5üj£nØ3BIÍÛ¨àÑOè(Ü­= ¥Þ·ah¦÷yÎ&ÆØ­ÑzØ°ZnÆÙÎ!Ìÿl!S\bHß9X£gUDj×²	+ÂmuKÄfò/ÍØáí½üàÁE;·¯:ó0j|ÅaÈÏ®Ï§e*í&yÿj²F4»x¬bKyµ^$£ËÝß zBödC§;W(®d{p%w×¨]¬K¶ â\Ø½ÏeZ·øÿØ²s$;S÷X8ü§$MC%ÿÒô=}L3²´Åè®ä¢Ælàï\è*í4 {Nå*B¤[cÂ¥U= ÏLÌÇ¸ëò!Â^DJ?IÊ°½nXÔ´0²©ÒÿMÙ5h2ØÖ$oøTÄ±b!\WiStàðT2ì@jOÔ²[T¾g}!áÃ ÷%zPÜ}Óm1pB´8çÐÉÑMèÒ\VÏHá¨"¯5Ý
~Ù¸îó ©·øO²A±ÙSåF ä¾A¤ AÎãK?M½P3Å÷Ìþ~q~hâpkpüïÌÍ/Ï÷6tC ,ìo_ÞÓÀ·I.¬¶è;6uw¿UÒÃf=M <¢yß©~¼´=}ÐUæu@Èn±üü}c5¥Í	¤®
$²AK=MýÀU¬O×Kü.|ËwÕêV]'"ñ}HÁ·£ýi¥$³x²ÅuNüîáU¥z3 ß&©<Õ©çñfl£@DÜs^iVq·»Ý	= Z	¿²&mKCqÔë£Þ²O0Hh±Àz Ø6X(@gaò8¢äf¯iìôé¼M7ÄcÄ§¼=}PÆFV7+X÷Y½p Ls$#WõÝ¬þy}¯ýÏ{,ÔYyîÔKe0ÝB÷æ³cg½9£LýÉÔÚ
m{ÄùãnaºÖ8£Cdã«û¾D³=M+*ü®]
àg~îHºø¿ÂKÐ¦HÞÚ^óÀøÖÎy|±¬ÏÌRcâ"8ì÷<!÷Jr8®ðx4TpÿÒó	ÈÈÊ·Q¹C±Ûç»°¬i÷= q×¯Ad5V¤@^#îË83È'¢Ö?Uï_42;K D¹FôeÎå¥¦(qbæ4®L'fËºð@C!í½·wïÁH-S¸ÒèÀùàÍU·®[GÂ¶\NÆd=M17=MzjRºçÖ:VEÆzæzüµÑÖÕÉ= oZ¥ñJÚv}áÔ²xM_=MJaTcyýlÔfRYîì_Qð|öÛÞKê,Ñ =}!¸= úñDO]2¸Øæi2qOÐÈ>ù;x¤¤«$SlTN­Á<S!²¶ñ¤n#XÏbëV®­![Ü¶ËÑ×0#Uõ Ðâ>«ã ÔH-9M3´LbÐÏ{M´k÷w,ÎQ¤qéªL*ô)cº 1= [ÞÏä#}í$¡ËàT­.í_HíTq¼ðë
o?¸É7Úô	Ór@ã½ÈÝõq}ë:(µÕFâôG´³[ëOC]Cu%2;~émºyÝfö´\Bí[u6×ß.Ë.ï)"w6;Ô?¸ìø=Mr9éD[Ø¸ë0ÕA²¡%¢a»×Ùkvc>¡,SL#f/]çÆVè<Ê'³HÑF£\ºäyÞÊsô¤TVSb9f¾t®oæ°}G¥['Áî'¥wÍ§hÊ}yöÎe¡þ¯ûùàÏ
ßLTVl0ÛXÞZM+­<k=}*ãå_°cM!úÊRlÌ'ø/#wÙï+ïá"¾Màþê6o©{Ãi~÷Ukì¼C¬«jrÅJQÇÌ¸'G"r*,Ó´SQ»ÇÖE:2¯K©teU,Åy£F¿F¾+\w.]CùWñ:-§I\\|¦[½kÜô\Í@Gk§²=}¬Ùÿu;ÓåõÐ¯¢­
ã\¯_ÝjÚw%µ([ßßêUôHÐy­ïLÚûäøoçñíâ·Y5ú(÷IFëOC±zZFòyy#÷là?Üè?»âêê
Á= nðüÞ¶ÆÃCÓÔ:-tç¢fÞpd¾_âã«¾eó¼Ü® ¸!ÛÌ6ñr£M¯6"³°¯ËÕs©úWñï ©#;>Ý¨\?úÀÅa#ýwßÉ!ù.w}Y*©xüÔJÖ ôúõe'QÈ¯:7nÇyrËÍÿ¼o/Ð[ræ¿DCéBìåËìíQ,i)PâþôpÛæDIÌ"ÐmëbÐ¡ÚLL®ÓkRçzo¨W|@
°Hä"&¹VØÑø2@^0´úÂ­Æ@DXù¸ÐÇBD¨ÐÄUzkZ´èÍ¡ÙQ#m
ëÇ,®;ò<9GJò.j¬.øµÒKíø°x£±õoP£)Æ!¢ÿ×þ&HEj~Í¸\i1ÜÃbÓÅEC3s°E´yaZb¬êA¶ÅÓ/(!¤ð2$iÝt¼P W©OS«#nËR^#­áÀzeú2K.¹ÏÊ/§ÇwU¦Õ}ÙÂý³p)õu;"LÊÉ?»À] ÄµÌØãDL3ÀM0Ï5Ce¬Åä2*or¹Ýp÷WøµZ 6)*¸»ã¶xY^p]aÿlö­oâ¬sC%Ø\wd!iAÉg³»^g âYoË}EÛ¨$ÿÎä[8¹RcµÉ¥ÊEyÜ*,ÿl_ÞHª UBmUÚýiÑÉÿº®g7¾% µ¥èÌºµ
Â>½åÚÙ£NR+¿M=}¶<ýÍØQ²[\·Yõ³÷EÜX·õ-âCF%&iQ\¨o!ù´ÛÚØJ~ñ[Y×fX2øËå¿:³ì"òÖ¢Z%B^Ë ºìÌs:#×
Àµîã?Y&0ï\ôVãkySL±ðÃ°åïÌK$ê]Ú¨ÆâÉ CîÏø¨Úùýú±â½·$3ûYÂF;£AË2'#ÿì$ßsÀ³£ À}¦Î&¦#Â#£±\©rËFéÚ<ÁïçèªO+3RnûbÕH!
´d*_ fÛô¦+lvï?í÷í¥¦ÜE½üØûC÷]Ü¾¶óQ$3bJ1û2±ºoÃ#!vrUyh?typ-]ö kí&ÿßóà»Ò%ÎhõÁØ¹ÕX´M2sYªcÅV¥òEa *ð\úÓ4{¾.= ÆaÛÏÜ0 W9Ehnù+FñÙAàØ$JMº$¢Ü¡IÕáÇA	JlvøP§õøÆ<^µÂó þ²hozâ#åÞA vÂù&7~-ñÑª6Á	|w÷/-åÆ®Î#Uº~Á/iÁý²,ÿ ÃàKX«o\»H{®5}äßÝÊÂ¨ÌN-o= ÇG(é<EûÀf%ïJ'ªÖ£M ¸ð¶§áÔfuì44Ë0*@ú¹+ô¶= äQrg¾EÿHZgÐþµ%þRkÄ£×ÖòÇs"Eýhãµ8-ÈÜ6I,[>eÓÜh¦®®/)_uá û²Ì/ÎR,HjÛvËãCVÇã,´h%bJ§xH×\©ÚÜ$m[MÒ¹8GF4.Xgåe$¬ul7Â&»R]âì·¨>à°ÌÅÞ¾ÍöÅ.æn&ëÆÝß ¸EØk:fÍÓÇçîÌØçÀé°ÀÂØóQ)Rf2±nFÇÐü®YkÜ¢ã91ÿÜ<|F:¬wmM¨G(ëòþ~º	aØäÉ¸)½i öykÚÜ93Lâ××<è±±Je5ô¼¢¾®XºÂÂ»¾C&é¥|¢4Ê£ÏÈ)qûÊ»"-älm*Á¹lÀæ_tzÌX¸=}Ë/3´àa£¸§Æ{cÝÐðjù»¸(zjÇÿ!âÂè¾RÞ}Üî!yENÑ#[à{Þ<¬T,ÜLL¦ñ/óþx ÓõwSZÊ¨®5
ÏIíßþÃ9«zìão½TÎ©ØâØm}[IÔ½³D«lFºi¯P«â9QCAÌ¹ïð|èsÇÔ?h´TNt9Fje5õÅjøÕ[lÎ= }«bÜb°óiJ;ÛèÑá~ Aó8·Èß·_Ï¦s×¦	­üB5m

¡ôÜÍÎYvY)K¥yL¶2·ë±Xf'/pvqÇÿ+f_â_¨Û#:ðà¯õærm°M1S_V^Û«ëòd¡T ÌA= ©ðAÐ¯÷5* Ò!d{½Ñh{©ü>>´IùD.iIióÞ]K	F^Øyhû"îp/]=M^½Ö
òF0Exd?ÿ[è.{ü}è±*å­2µKE¥Èq6tªpoîL@_fËð  \°®ZÓ3­Ï[|ß põ¡'ns¥å*6R³ÀÞ)I^T&ÜßÖt^èâ7j£4Ñ¬érIÃm YÇåÊÖl2Ræp/k4ý=M8XÀ;Àï=M-Åeü,û³+>Xµ®é¸Cp%iÓùLº£¨?B*AÈbçþ"¸H¢=MÏê´VnìÚòÊ^ÊÊß´ » Ï¬Ø K"×³3ESúÒÒçG|IÐa')~?Ç³ÇvwãK@ÚÔesW¨ÆÏf©#\Óá|¯ÆaAO¯³Üï 
ËßqeÌõwY
h/aÝ<ÃÉÉ@å]Q"¶gAðX$ìasFP/JûV×éûZ^ME]½±= T[þä¹5ÉªqµåÉ°(¤El¾LPpãÑû´@É_ê=M*t¸')JÌ?Ñ|kÌzÛ$¨ßóýKnY¼Í·õÝlpÓ4rMÒ
D?pÝäÒ÷À²Ã+%&´ÿZ¶Æ¤Uuv@Xì@öèÔ×ô¯<BÓ×<?50¿ÇÛ&´%Ç_F4ÖBÕ\#hXÙGæÅ4ý|¡¥×	\ºØ%]ëPÒW°Ò;yz'ÔSnâ?îXðFñåêy³ðl*A >P¯7#½ ÆZÇÇàr0Ô0Ü¦:Y4g1UËD:¼ºEYóV-Û¬M6gÉ)É.Z®)Gý±NN1çÙàÑðÙf®ö<ºýlÞÑg_.
qAO[Ee¼ÆÝÇKzË=MÆÊkÖ"³·^òÄ7ÔzO¤VsÅç=M«6xÂ]Óv¤ûÕsì¢Vïc¡Cæ¿Ïyr2z²³.å*m¦úp¥²Çmïx£	¼8Ü® Îq¾oðçÎOKAïØ¼QZ+*ÛkÚ»&Ø~{I÷¤Bþ,eÍýtWÄô$WÞ= ò1VpbEwNteVÐsZV©G	%­HYvûdiPöÏ´g4|¹*w¨À³5¥1=M:7LoØ²s}[áOî½%=}<§=}ËSkðÔ¢'Á¹Ò¶¨é:¡8çÈ>¾EMjxd},É$EæÉo®w?Kb¤³¡¦¯Idc<xg@ØÄ£
 ¾j 8õô!<)÷1êØwBê\KwFªÄÎKÑÍ?Gånh|ÁG
¬ûóvçF³Òlo+kp"ûÜ[©È{®Ëäüÿ?:CíOawçàÌî:{­ÚÊ
aMÕX÷ùÃóãÂHjAX¶¾ÜË]@þõÂ«Bû@¦¹h(è¿1X<zYDÊ°ði}+Ðèa±ÃË~ûPÌxÔPÂÇ@5£{E=}/XÓrÞ-§aÖAªû'¹,X'|¹ChÞuAþ±U!UwÀmm¨MY¿W³Â&\ÆÞ¥µ³i¢-yÄ+ê<áå®v}M4Xs´V¨Ô	dÃï²¾= LTîáåYY,· ýW%â  VY<À>O= 1,<Ì>«É>ÔfYrD)â§nn±µrÌÉüPº!Ò¤ÚÑ[ðÑï,%× =M 8ªjÃîæ%Â¬±Ou<úÉê]saZ+ú¥Ð5·klÒN<Û­ÄpÕÃÖ±ØcD9¾ÒPn(êÀÐèë ÉµüU2uOúX´{>?,RÃ©²~ózËp[ùã 9Vàlht]4HÕã¤×ùÔÍå'BGíl¿+Á/W\Ñj2~_Z:øÑ£UmÁeµï ù Î ­¤¡éÜÅ×¶$¦ï¦+T>¶ÖÓ
M+<ËQ	
ATÈCòT´ùBüë=M1þ'óÐ«]Ì] ËbÝ¾§+Äc= ~m0½:%%è©Kº%ª5ILÃ5UN¨ï¢ Í1P§ÇyîåÄ\HÂ4*Þmä1«S|mZyb+½DI&x~óª¥q©>ç=}j¬ÅÝd y÷ÒÀk(HA(Å¯EÆt½Þ·@ß\WPö\ßù%Påî·ä,£t½T¿8<gàta\ftÒoÙßì#:ÎúZ9r³ûQ£/éñw¼B(KÚPdî\ïÂb¾àpVÖSd¾êÛ9é¿¢È²ÑIä'¬¬:Æ^UJFY}>³ ·gÞv5È4wÄQ2+IÔzoÊ?xåâÒ9G$Zû©¥vÒ[æ]mI ðBÞþÒÑ¿ìÆL6µ@TÈ.)t¦\~:¯1ò1 Á±%gÄbøÝª8vxâö( ª'ð$¢òhhÉÉØáC/Ý·ZpZßëa;#-O´¡Z¡Þ>Ç 7ú9pDáIL Q¬<_ú¤ùÀÓ.ÜÕ9aüþÌÁk6h $u[©&0.gÞ]I§ ëo£®ªØDàAx¬.xý.Ê=MðòËDÃ\à~è½KÜ0ÐþÔb<:þ<±v@ %6°öòPÏ¯kÈ?À6Ò¾
¬èô,9§Ó'(¡3ùµÂxLñ®¦òWÙåuûb/t¾ùUuh ×x|ôxKÅl¼;É·%DõyËÒ¿sâF*_Ô~²k5±í^!ç¤¦eAxèÔR¶®VLÀ= 9ÞÌKIñçÔqØDb|³­tUmLNnE¢=MÌo\Â¢	á?ìDé3|{|ª^&rÎEnIbrûxPg<Ic^¡æ|¬,ZÜ$R]Ë&'fü,sRt²s!ÓÔDR¶ØdúÄ*Ôàp$¯A¡~ÄTÙ|_D´b>òÔ¸oû æµD8Cjò±ÕÏØD½¡Û¹.üþÏÇGæ!=MQÓIQâZû¢Ö];¸Tq¥3VÕó¤ü¢ºòÏºÛ,#ôìp)¨&ðü¯A?óxtýçÏä<>?Ì]I@¬ºÁËZÝç¡O:¹ß\4Õ­W\L<Âf®\]_\ÆØU&(JU0¯1h¸³}E´2+ºà5ÁÔ¶â)Bº¨¡Âï¹w	h°Þ².Vò¯²ê¸x°¢Aú2@,»?CäN¸é6é2ìFFc;í #&òèU[Ò5Mã
jÈÂ u§Þá![L!x«8Èq^w"*Áµ,*Oï	Ê'Eå4ÂêÕ
9»ÒPÐL´DÅJýç¬¹_£Qa>éõþF ©ÜF½\ Ïbä-Iù9»9¦Ó8öT¹>qXÝÄ%>ñÿGnp6@.ðmë<SF£Çâç5q¿Ä@lÿUA,Í õî1î	RÑófpõ¿bqø­7i3=}öÙ² g
§Ù'Ï«Æ÷+9"S-¨5O= Z#x?ð?yrAÙG7éh¡ø¬sÇc§¦àÍ!D=}«râ?~ÿPW$Î åÙÒ)Å©r'LÚýÒÖZDçè¥"F]d)Ó«R{no+;âaÏÙdyiJó÷k_eFRüVÎ¬å#;Ï1zqªw÷>±«]8nLÙ¶&Hä»uÔ= 35­¨ÿ')Î±FÛ rbÝîª+^Rà]õà/nmÚh4ûwÕ°&´ku]m¦GUn3¦Ýù;&¹¡Ç Úån!ú?´o¨¨+jØÁi¢±	ä}ã³ã&ØÐxò+½2á¼+Z±­Ð¾.)Æ\jÇÀý·Î\ëEãuHþ7°ç8:&'.§Cóç}·r5ò1ïaZþ§¥'fð«HÃÓèM¨¡©lkÄ¥íä19í¿Zä#ý ùédaTk
xty.X×PB·CnëæÒýédbùG­GæäZ5_aÚÍ
ïyÄ§Èíy¿&2ul´üþ0HÑ ÕÖè7~±9±Éò_ñËD£)H5Ùv,Uµo wËMì²Å²Q[gÞ(22x =}MÙ2kíërCÈZ9 !C%ßYÎ?40±s¶ùTl7Ë¿[tDÝ= ;'w£.¤Þ ygZÉ1D20¤¸¨ú{ ú\<¸mUåõÇøÌÈHèíS=}ÈÏ´bÿ×Ã?1RC,( xzz}Ù·wTÂ6<5Ã¥[?/Ø'8à\(õºæ6òÇ(a!_Üc«C|KkÆH®[oäÙv¡9:ïî¬ERâ	"ä!iJP}¡íº=M³ëÏÚuYý´´ý·ÑCmÈÓÉÛ4¾¡º+´4ë»3ögeâñIöèVñð=M£pRçõh¸¢¯¶{Ï)¬'ÊN°óÄqX0íÜy§<Ô;ø[ûKÎ¿(öøOíåû+«ì¯§ý®·Yh»Ø~Ù*à9¸AY=}ÿQÀ@F]¿è'muÓ3JÔ¢øõ¡4GÎ1l÷«ÈjÚ=MÉ@(¶H¡ÁßªHg.ñã²/.V52¬¼ÄLÏ/[Tß-þ&Ë@®z»æôYNß»ÅÈh5øÐ!5Ì1´vm§£ÞªÕ&>Á·ô× HéCýAwUÀÜnýa$ü*eÞÊ©)Æ2ÚÇ2ÚÓâ %òüï;­bg©f.Õ5EèàIýÐ\¢ÃºÚ×#êsÓl:Ù"þåTçà<Ýüh¯fÄrãüV£l\YÝ;Sï= ÐæEQX©Â»= Ð3z2=}JQ$Ø[m-FVã= Ðf1z2½ís¶»éqXRxªñbcÍ7aï×¨r\OÅ§.'/)*wF·ùGÝ]ºüÝ*'Júm¹ÖpÇñ(Z-i÷ð÷)bA©^$e7ÞèçÈ6àïº÷.®ËºÆr5¥ÈÞ)Þq§Ñv³Qº=Mo§Ñ2¦ÑVh,µ=M¯3S©Vø¥Ñü¹=M±Cò!³ÐVnZVÈ¼M4N¦0Ct<gé¦×úÜ½}},¿ä"ª ×¹ôé$uñÎfN-«ìÆ67ÜÆ>&1T&$Ä,Ç³<Ék©®ta-äëX¢MHÑ:mÐõ¾é¥kNÝ5´ùåÿ­ÑzäQÿã¿
áðÍ
°> õ<¾\T¯²¸zPÊ´BÒt¯T«©Àg<Û(Ç½HüÆSø±»]!/º¦ð^FI= 7O6=}LsÕ%'Ô¿ßSâ³&ÈuD>²¤å%C,­Î,¦ÁóÔñ(A0ÌìËÀdj@»W!¸;tv=Mú®²qJºðS Åq])qSª¿ß¤lÃcæX&§îtxþ6£ìÑEÕõvV^ÇOv¥-Ä6mn  M*¶±)= RX3Lñ|x1<6²¦ÇMO@íÃUfkFªÈ/ûëÁeÞ&È/{ëÁemcñ.Í§ÝÆ?5îÝC±)8·ÃÌ!ÿ@18%¡®¤æÒñ1ª= ¢Íwùü¶jÀÊc*¨ÔßuÁsdHxõ9[ù"ù¼4z0Å$ØÍ¿6¦qÏ*äL7à"1^øë¸Þ2Ñ¥Ôyf7¶ÙZ
7|98*=M:äNcßEêkHª)·4ºÜAÞq~"¦Z¨ìVv@ºÃ­e¤+ïJÌ7¿ÖÍ^OVAôNÂj®2Ô|I9vcPÌ½¶­£äS×Àe?±º¾?: 0ýW¯I©öü«¸L~íH2H¶= KjóÒwFþHEiøYø {µ2/	#=}r$$2X¡%X+²=McøéÄ£oÝë×W3=}¤=M7?®fÎnEE¨è Ww9g±ÕY¯SK*äz^Ë²4Ð²4pæm±ÓLÐauU±h$ÍÓöõ¤Hâ >®­+ ë@=M°Âç{rËmÇT²qeÂõ zW$'/Ø	?;N!¨'¯ÍUúvå£§z*·§kø¯ÉÊ2µ×åJäkÕúDFXdÊ¸v4m¶ 3Ø®JÒ<1Ì¦UÝVó®Sa£?â¨SR±Ã+¸1þ@£yI°hø¥bkªSçß¿K ×dh,
%ú%õ¡ÐIÊ¿0M[¥è<Cøò,ø´Ùòåè½¢q·ÆzC¢
%þõqsNÎ÷¾x½á[Q0¶¸óö\¾1ÝgÍüôUûs®=Mlu®åN>ºQÚ¢',LsEÈÇý]q=M_ånCnJXKdKL¬ÃJ²¦øÀ¬²ü =}öÛ_]an·"®ïÙ@¦:òÚsøóàî ¨"jÓ~w@öSå ~jc®Üß}zÂÜ[¡$Úµî"×7TWp¥/K6z7î8:ýEzü¯h+qÇQr¥Ê²Ë wFj÷¹möàæ ;÷IÎlP¿{¬2a7Àli¯%¯îHªÜ5C.6FÙÒ}©±¥«BC+§ 7ªï"ytÚîræÜY±Ûð=MDÞª¤åÄ ód¸úð5 E¦§S@Ã7©B'¶ý³¯õô¥\-úËÕ:%a¿g@ý\wµÍ[©ËW
7ãÒ7÷+v6ÜÒêsR²ô.ð$q|vàKO8yFLéÒ	ÓßvAÐì*UTªv.ÎÜê0å4ý
ï2{9: RXRg'e®$^ér{ã ­{Ãñ=M$Íµ°[= bbâ×;¥5øy6KP³m
ìûeYÞù.W¹m ÃÌLñü7¨}B¼ï
nY#ØGiÀÜXfËPÁÏLïB fezKHó<&ØXæ
X[åÛÌÖC{{ò*rï3Bó6Ü­6¸¹ÓûÌ .­á ÷Xeåµô´îj]©!Eâ]úñúí%·«nòl·µÜ7u]9>d2Ä"aï8úr¶±2ZlÖßð:¤áÞ´QÒ²ýw !|µÆO,[F ¾ªCá&,ãÜ[Àè²	úÁ±¼ºú4$¤Bý«ÙP§%= _ÒÞþ(S©>ç.(óÛÎ©ì"Àïy¹áèàq®ôµ#å~ãÊçh2;Ì<2vD®ÇP= {Ù>Ü²/!Kü.#ÅJçhÞf#:7H8 kän·dÄgOñÎHÉÉäåùñF÷v(eØ%ùë÷e)Ñó.ó8.cÍ'Nµù_¢ÙÚy¬<ÈØs4Q Ý¼«ò¦°<zÐ¹ª"¤8U>c Äq$søØÙv6ïBA»ÉÒªx 
	ÕW=}F´PÚâ%+ô¯Ú^è+bsA'RÃÆ.¬6NÖ$'o¶/L5(Ð>Úàô/)"¶pÖO1^mÍFjìMÂ¶ÖxZ,7ò­íi¯9ºd?¦¿L¨#X*c	éBELæ¾¬h.¬gÆ'Â{¨ýN¬¹§§º©'õñÅ>k ïi#µ#YhÞØ)Iå§á5/çgäa©¥¶%}¨'cKó×ýæëÜÖûÖLÛ&4é~§>~©òçA·ËÊÜWÊ§Ã¸·;= ;#>I8¸ÔïGjh¹\Ð{³LËIG¹EJ4ã;c./~	÷YVÅ,Y<-Yåt÷·"Å-ï¹¤Â5Ò	[ðÔíãcor½6~2¥éE©µ)Vþ¸ç|9V?Ð/6éièÛsÎ£ø%ùY·ñÀIûI Þ­ËG 
«KcòûAü=M+ñ=M~4$y%~ÔJµ7(>K+.p×'é¹ßdºZnHß×6úIXOá<=}ì~9ÓÏ)ed~AXÖu¯±=}îO¢8/ªÓS»f/ò1@É= qùKV¤ëÄÌ@m"UPÛS= bÓaChðò¿LÅSAqFEháãHwNÕ¿o+ØÃG¯]:×Kñë1HË4= ÷Ã¬áÌ|®É*~µ÷ÎyGûjÃñË&þzM]C+;ÏÉÎ(çë=M}û=}ôw½ªéäAym,FY	XÔ:·_ñè.	Oº"Ä}»ÿ}Ú	p;7HÓôYZ·Ë« í0Ä7ÕÚ92*?YNQl)ÌÛS×"CvÖC3|ÒªÑOÂ³áYýf ÕhuÄqôU¹d+Ùmivm8|Üï'ÀÒÇìRxÍæÃ¯P£)ãV¦Á4hv«Ì7èeÞNË·Ýt$boX¿_ze¾FASq9Ïe¥+òÇÔ¢~f0ôôy«ÄÌòDó_çz<m¢NIäàz'ÀpRñO_Æ,×NU~b|çÁ{çÃ{gT·,h4d:L-àF-àÎ= úU£ÅE£²c@À¤~õ¥¨n%bH´ôSY¸QÄ$x±·N+sÜfIËKÁ ô¶®ë¢.ú]Bm_È°ÂÚÝdW¶*?®Oõ¦¨$RüôJ= aH= ßÇ1hÌPHÈE ÒÃ|x)·jû°¹ÛñãåY¼S_^ÑO¯3PAÏAztlß¸;oÿÀ)±ø¿Kiô[âµÇËf2ûÇ <8f¨©fQË(C¾ÄßR¶Ñ<ùc(-PÒLÿ]R)0Ç4à0ÓVy¶FoCkúÂ;Þï7ðvàfhkfH2LkvîñA­üzTJòÖé$ÁC¤MK#Ã¼Yì_°ì¼H°jºîxòªÇc·ÃWà|ð7#{.vÜf»-Ð8£Óõ°HdôäKv¹iâuq¾XÃÅêP#^0f»£.Ì?-Â-Q°tðáÆéâl[55©È* =}òHý; i³¹xs _½¡[,½=Me:Ng¸±¥â¥èÑõ	D¼ä$©tSä¯Ë/Rµ.$¦XÂÍF4?ym·L¤RcLÏýNô	µH¸¹sÚ=MS¦¶JqÓ3%ë\ãLÀóB !ÓÊZïwöH§z¯IñÛB*|ÜbZ2Fj&Lª¬>DÔd9ÏCNnoµ¸ û*QuûÍ÷¬  ýÈÕÅ= Uë¤Ð3L©ÿº÷«dû Ù|"máyïø=M¡6âÃÐÙ= dwÃÒæKçLÆÓ?bé;åJ»ÝÈÓUúJ¯ ,R»
·¹¸!h~5BKòºHô´HnàIý·_0<ÔäÙ²ãÏè©®ºFoâ[ÜO0ë9jT5¾	_o¹)èB±æÞaK±P5ý­4OW1+ê=}[b¨z?{ÊÇÊòèYPÉQ%õÌçA=M·µÒÈw3âÃøç¿Ì¯°*emBÙIÉ~ÞÈÕ®¼VÁÁéý>°CIa¨%Èýx
+¼áü·ÃVõFHtPDtuðÒÝb­?IzËF
1ÈÜñ¸Äþ\¶¿CØâ9MP{®Ð¹XmÀ¨£Á¦è1jOÔø¿r4G´r4E»¸Ë?á;_Ý§Ù)ôØâQúké²^í£¶¾Ù¬H}H}¶Å ó2ÚD}ÿ«r4ÚÒO 0¡Ô*4ú±évÔmWÖ1\=MáG,ÿø+ÿØ>å¶ôòâ8cWÏø2"Gs¿uÄ28©=MúÁ¾<X¶FL¦Ð$TÃ¨<Û¿ªÓÒú¥Ke×Ù}ìÊcckÇOÍý@QjÅ"YÊR¿ôìÓ$Ê{-NLKj p¯DaP+t¥Ê
Ø\ªÏ¢ÏåÞ<Hò~k@	Ë	kºÏ@«²Ó(îEÄ;9c}±@èÏ¼c2
É_hOùíjÝoq´ý$o .
?¹§Èµi«ïüuÅð£(Óß«XUÙX»ß9 aX(ÉãOUÎ®cÑML,Y/¹EâÇdËÓAaMþúÄ^;¤Lbcó°ZjÆPRw3C:¦ËÅsÉÿBí   âL­Æ dÀ J8[võ¯¾î>á8qRB¦¡"T-Ð<Ü§+ÖÔÕo¶ÆKwÑ×ù<ebö¬­»h^%nðóí·=}S£PHßl×)+ÂðÎËu¦YÔ$öË3OÑfºH6a(»a.dØ/?ZRG®@ºý"w~o¯ÖÑðLi£Gû8þËâÃò z¨1úrÈ
ï0úÜ\{ì~/LÎG,øBd,[iÏ¡bqMéÈ·Bá0§ÂÓ>ª×Å½Ù¤í¤§£I<ë4Î>eB$°ñéPêBÍQÓÔHËf"f¬SË¿¥³ò´;+&«V0[¦·è¤Õeýãezc1ü=}(«4§#ÎÁï4ÔúýÊ´YÓ2H I.ÃL\4´2-*"}ÄÛZ7É¿p°®æ ¹VM9&S]ÿíaûÇkû&{
Ï= }Cg,s\Ç= SmÞþ%ôé~ÀÒòùÏÂOIêßæ<x7S[¬)o!VC×S×
~E'StFc×B^c+t0Ùóäù#ê°+íÑÊÓQÔVøPÂÃ (ü±ÑáMÞpÓHI)TÏ¾\ÀÍ@ w±¦PþÐ!1U,â3YUÚFúèW<¾îÐ}ÉdáßÞÂd4_È±Dr*Ë1#HwÚ~@Ùd_v¶²ÄûCÚTüÛ¯AXV^NuAEÄ/U.ÖA^Ç³ÂN¾HøG¿ÝbmojFhò£ýR©&ç}®ô:ÅvI|D +×þZç¹ïAN«§U~*AOÑòï¤lxûµzãÓb ØÖáIÖ¤âMÙX®?Ð±¨f¹
Û\¢)ÎþÍK6ËW­µèJBÝ>SùýùÞÂÝêZÓìoA:§Né "B7©?áñÖ:6ÊÛ¡Ù,eXÛ²[@¤ß'h2¸I ¯«xÒN^\6
æL£}¬^u··ûNÅ{W¾÷9Ýn0Kõ(ÀvçTu@Xz£!uìÀ±ÞéìÐm4vdojV£&Ô0ìðEÄvd@ê£KX´PÏm?¶#ñ²bVÓ,Ôlò²XVÓ(Ô\C£K~õyd@ÐmøÎ
E£ëq
EØ£Ûq
ÅEHNõâ(¦wÉ³(ÏíÏT×õ«?AêújDWkqWÍjJú¹"è-Yûò¸(P[Ðôëd=Mz
!LSQ[,lÂcSQz
 óóLMz
 ÐôóLMz
 (4Kðù÷

 laW(õ¬³]pâÊø.àZ×ÅaDµ¶+HÎÓÐWv= @á£¿ZÑ³ÔN§µ
w?N¡CåÍÕ
êSAòªõu0ìíì=}/CíwÚrK¢BÄa^!Æz UÈGÎURìÝ²uc@y£êÍêS1M¿UU#òªõ^CP¯Õµp&¬	3<Pì|~!Ñ2b«ÿàñ=}~CÝ0yhE)ýºë÷·âÀ<eÃkOïABÃ;ÿhuS¹ïw¨~öI{·Þ*O5fô¶z	qê»îíàÄ'>;?4SÏ±ÓwèÜÌQ´ß´%xôÙö=MkLµ+Õ·çï¶ÿt	ïJv){Tt:%Ût9¾
=}>/KÙhWÇlû:ªÂÔÆ¡]èÚ¬É,LôôÏÕtífHÃsX&_âE3£E9®çÒ¶j &_%g·R_±Àñ®_uV%B@¬£ç÷ÂNFÂAÇò¹"ti
ÅsÃäJ,ÅÚO%ÏÒ8ÚûÉWiG¸¸_®DÛOÀghqQe±ÎvÌ°µì!QÎQZaðUp4£y:mëc Me[ìs©åK,º]§ôýP­î]çPQb,³=}I\ ÝÔÃô'$â9thóÇr\Ú?ù {·:MÕÜA@'cîÌ¬'Ë³¨?'¶¯4¬
7þ(¼ÃxdíÙ¸«}ÁºiHcè$lôFZ±z>HÌG£¾<É®d5!í¸ñ¬y{sFµÆÌxM Ð¹Ý	óÆ?8XùRS/ßg§^qµêò
73ÿÿkÏkãÓÞ2ätL*Úäs¬zô0¿ôlAP	t5¨*=Mô$;<¢ó1»&ª_åyIîE4MóÚÑ27zóÇy¡Ù¼ïúmÏVèáiÓê] »8ìi^5è·^
xçÉtÿöþÞÎE0dRû#9´¯;uµ«Ä¢=MÖÃÁæCXEx¤èùÖê¬u¾BvÅÝØÁøÔ½ôoT¤óïáø:ær hõN~¡÷¥eìÊ<[4{<ÆN 7X4».íP3×¤¥2ìòZ,C'n¢åø<í{ý×?ø+ùî­$Á3òE¬= ¶ïbÇ;Ô¡«îqÒS°çÆz)ÈPyrOßüÌÖ¼½&(­ùWâ¥Åi¢)Sè¿ú%Ý):5ÕGE_vùÍO¡!S(	Ï©M9^ù'×Ïó":¬¸9º£g¶ohý:<¢)xyS}àªäËØJöyAdN¶,vrC­7·>Td·Î\:Ú'æÇª®Feî&bA±'õýjìµÄ=MD½Êíó¾zªZ9ËåÆ ÏÌkþZ(T(Á¢d¿¦_Vd±ÈdHGAC½ü	ÜßÕaÍï3ZS>ÀM\p­èYr¸o9yå,8í$8½P=M«#{ªvPÄ©Fz÷#5üÌÈ»¼cÓRÎàí×Ç¼xp§ycßÝóñ×ìx½ <% ÃêÎ_VÈ>I2°é:Ù ·¯<,èµh4éúhf]Û(%w¡´?uÝ$Íf}¡@LWQ³móÑàN2ÏßR6_0#¡|*p¾_&% wÈObýZuý	%/½õb#äÃ¤¥ìß&îµOõLD7ýþÝî£Þvä	ÁIZc·= Læ!F\#¦Ñ.ÂÀ$·»ylq4FÒÑ,Ó¨T
ôÝ)O²TØûÒS<Y}Ï7>Xý¥2uþzq_X~´Ix|Þ 4ÎÈwy}®¶ÔøûqjÕ­_¹%å#×OµÃ74=M«UÆ±zi»jÊB&ÔòfÞ´'ÉÉÄb°N±Â¿bÃ/ÔKEßU"x7_M6µò÷nüù\Êm åTwågÜ<LpéY«Ä0Zp³ÜñÞ½ûÕ°+;s¦ÈÉoU©Z¢1ànÉ ºE´ªÙJ£l\t %¤Ô
0w52æf_ÒÆLQÊ­]b´ø#úÿ\O9Ê¤g>ÿy?ªêÜ¢ödlôg2e¿æ4íî¢~ÃaAT! *x1¡YÛx7Yíû£y¬+â!:0ÙG=MvºF»´î:¬Ô}Ï¨Ð¬óy-½py·ø*È÷¦ÅöýèxdjÙÖÇÛñsö¥uhÂ½ö­2élDjsÎkÏüªÃOÉåÜj>Ë¾çNNddF9>^Gßªkàx×WQH8í!?È
ÐðVÀº.gc¨v®øü6aª¯D¦éÝä:1¤*Vû9©0Í?i	Ý5¼H(h£jÄB¨Óùcc$GTù[jvôYï¤8ÆêáXÙd½&ú©Øße£v¡m?Ìj"=}Pç·2VJê9­«i/ó= ¡!'>óY\>àÖ(¤§ÇÉÄ×ÇNFFÒ&6dDlFkN½|\&ÏjÃZ-?Åõ= lWHxîtµVäFô¬9HX1rj"¯¡}Ûò©ÔH/ðKçídWÂ¢C_»BGÈñ¹­sMÁ9Eizëc:Þ0S¤}Òo	Jáw=}ë½ÉóÎ:VÐq'UécÄ?µ$)·µKÇ7¦iýàô)L;(I½FëbÖôÄ=}ÐP¼¯¾×ÕërfJ]ÜBC~æ¤a÷Ó@®#-VÕwÞz+ÖöøÈ¶4Q¢"Ò©aÔ08âÓÃpöh%X6àý6ÂÒiwÉÃ-TbÈyðÆj«KCÆ	8¢aaö>böÐyEÞm«¥ÍUeØ}ç]BÏãÃ¦áËr>q¾_KêØøÆâ<ÈäùýUö ¡ýæ,½åm¢/¯x$öp@\GùòjWN*W1¬'OÓ)µÄ%2«=}IlÆý,Â*2+¬±ò-5 =Mþ^mÙº·ÛWcd MÐ¤ýy÷NàÈj«êÈÄÒÁ«Q9Ó½»5¶ûzûI£±½¥¶UqlëÒ	öMzLZBÏiLOòqyèùð<ñ	¾29úôÊróI*ÆßôßÏæ1)ÓÛjØæÄ£ÆÀ=MyIý·È·.ÖQ4Å-Á@V¿ðøÉXécé2ËðhÍ?\°~gt,üCJ58â:âéÿ§5e*O	UD iø=M4j%¾¦ñs.Z¶iâPí¡úàs±·nò)æe¾^ZMûO'ÿÝL­î·Î(êçvµk0r=}¤Îò.m,ëHxßnêµ|Ãé<nÜMCèx¯=}Mÿð{zËPëzôG÷Q¥G1ÒÑR1zmÖ#¶0;1= à°7!îãáN%ðþ©¤áà½½lòY}Ì#}¡Ôd½-ó7¤s~­;ù=}:¥úÕõ­+ØqNFEÿæýÄù8r®6Ù(Oéõ@=}p¼HÁÓ­ìîA¿qÍ¯¤"Îb3 Pw6Í©Ô-kÎ^w_Êý¸7ëÓnwm6­(Î{E#ÄÂÈS¼SÇÇpçDîr¡}ÝÄéjZª5À/ÞïïßÍÁ5éù©l½îG¡gGuè.ä7ñiQ#èOñ¹¬­T½Õ]cæïRO# Fªâi<®WîGªòáÜÕÄ9q5áßY¸qS 9y®¡b\dÅÉèÉÐ÷ß5ÔpÃ OÄÀK©øekÑêëyþß$uÒ=d{ÙZ·òÞñÛ\]½ÎÈ¶"[pèùN\¸g¤0Á®(9â6z?!¹ ³_Øð¶8¹Ôóx7Ió©¯¥	X%*KðÖ{®¦= ¸­ìYü­oç6Ì!²À©¿1ç4ç¢bIÃ7ßÕóýÿ!Èú%ªm\ÿ N­ÐC	í²¦»+VZ­ªÏm@Èe!tpÆ»Æ4=}»§­¼85ÕLZ±dvËYÉ]Ú?¼.ã©¥­8­D³£ÿ::Yèáâu­àËÜ½íRZo|/X,¢q&µý]ì	r@,àðÃ¹ÆIöRäUý6sZoÜUÜrqâX<Õ$JÍÁàÂ­Ë5<J­^°µ¤DÕ)§M¶Îº±m=Mÿú
BZ½GU$ e?)ËñEgtw¼xM;K YÈîêÐvÃã!2Àëéðv	ÜG,Íà,S!	Bèñ2çt¤ç_
1kÍ@®ý³Û3ê«ï¬ÛjÂ mBTQïBPuËÊôÒòêAà@èð¦á5.)yÃºN÷9øÀ)ËV¿¤Oª>4['eê³ÿdãp3  R¤plZ¾7ÈÓö¾¯¯­iò¤ø?I~K=M\Óì|ïx)ýJøïNÿ6Äea@Øî®÷ª,Áát2³¤Ú¸;Od,[çh	ô¯®3êv¢À£O&KëêFÛÊÑl±læLºVéâ!:G0Ùu^ÕóOu}Ý%¾ kæ¿û)¬|¬5o¶·Ü«úù¨åÙy²³Þ=}¢äÿU­"PÄ}E¨R:éÄñÓ
ïm= dïØâä©y[ÎJj0­8hÁ)iy6þß«´eÚÊÆ«wÄzÍz¬TmÀ?L 0¾æV4Ydí
Ï=M«Èmü[Ï
A$VhåLo®SÂ >íx_[ÔXýlÝs´Ùx8±Êvò
+óíñBUÐjï_êÔ­µçoòÂ\ªìàÑÀYÓËCe{ ¾´ ¬Åh²®.Ak0¥,ÍMø>Û6% )âþ= rÏÿé®¯ð~óqUMÑ ©ô÷MûòV4©¦],u v þ¢ô]õeý'Hwî£%6ÂOI¸1)ïÌ "= ¶ê²>OòêLl+:@Î+âüR:¾]"ÙÕO%Ð¨}Qâ­ï±18«Sº¿=MfàÀùEô©®ý¿ MåðäPaB<,ÈÈHçÙÔþdtãÎ5LÃG0{[êc¼9è +ÇmP:¼ÂKÞ_QW¥e7ê¤ ÕYéIµWë­1pÑþU6G¯KAPvkÒ,¸8ÇÙ¥xB\Ø!Z:Üßÿ^Qc@@liÃ0ÿ,Â¯®\×= ÏxÙm\|(}íÒ_ *TdjßYÜ	C_?J¼¦dÙñ¶ýxØSëüwùñÉÃnis~õ_Oþ[êhüË®a¥NË= GÝCô«<E >ú4(FMÒÔìxíì©êí»"EiÛ,ïGËßý?0BmþÇÕÖ>ª97~?o<±îw'è®"î;¹Üf92ìÍ ®7k9RøCPùk<,ø·h74@ò W¤÷~jÈ¯óui ÖFþð1^~8?doÓAi^ãéO°ö²ÂÚz´9=}Í¤AÌÕ¤NºfÔ<»5ÚâÓg{Þò¥*»û)$oo
JW­y~(ÅÓ;j«Yâ?úEa¿8¨!å)!â²fO¬<
ì±-»÷ñ§0m­uSá[ÿ6àH<$8ðÞb}\ G½ÉH=M £¤1!Ì= ø4Ög8p',[Ýp8­½ª¿+ªÉ;bÂÌ<ÐÃ^ìuOy¼ÖÔ}#´+ýPÈÉÛ»yÜxËÑBýÜ Ýç¯ô.¼ehF¢Ábæ8ÕiÙÂ²N§®¹o}õQ××»Õëöy8ÆBÕól=MÎ cÙ'd7Û¦¯Ì/ut¾>1keu­ê¢ÃthMuÞè§³k^ Î9p§l(Ó¼I1b¡à9SùêþÂTº¿xëð×_§ç*%æ½ûàûþðÝ×¤]½©C9K{öþßãó¾fA©ò×¾9YBØ^mppúo.Çþ dÉWbzóñ×TéL×kÀùö(«¸òîøË¶N+à4áwêcA¼Çx&NÞ	rµ -&Ê:ñê\'¿ËÝX&½&Lg?l67Ió@K°u©;xàØn¯|¬V6d·@óaì¸GN³ý\?&= 	®7ÍÝ»lö$ä»ô{Ý½8bõ¤ÿCV¡èX2Ô¥ÍeÖÉ<GcFû-?Ù2âbßY:q7ÊWoÁ¸j×ÇÐKI×y;¶zUEÊ*·@Ý%éYÂÑø¹ z|¼o3µ3=}eÁéF&ãQ!Sh5Ê-^¯ÁÕ

Úàþªz3ô&C	o@!à'#ÈvÄKyÐâ\.il"ây§»«~>V¾òÂÎ|t= ­æ"vÚméze:¿m@£,z¤·úü¬fz70+¹³HQL©
'ûÚ©~HtüÔ~ðsp~yu2©.½ÿÏQ¥R¥¿é\X¼Ñ^<'cl 4ÛÆùËÖ¢ôÄYV¼VÑÌ×¡Ôª1¼(ä;~_|_Ü3ªDõUIeÁ4½µÞ!ÕºÛª¦ ôÝÓ¾uÅ6_^<¥+;´ º\¯ÙMOk½ pÑÄãkFpKpKpKÊï A.Vê³ô¼©Î&ø= Ü.òWÖW¡¥ÎdØ2hçnïYè´3QWouE¤zoÞÌÏÖ£OÖÜQÅðQNÚÆ\EÆjÙ©9Æîl7Ü.äÿXífåüøOÿ	-¢3Å«X>úMà¡4+zh\«!É=M \ÇñÃ"(ö®4oæðãkXÛÕõÖ´åYÏeª=M}S\Ë	ÚC/&±_þÐF¤­EÝØY#£DuÑêµ/¯Ú¹.¢O¥ «5¯*T0ÕÇXõáÿ
ÙÖN°mÎ³ÉþVLúWÿ£ð[$©fÃÅù¤"«NÕ$hMá½zoU|ù~UÛ°¦î; àtHÞ´X^£µàó.ÛóV³ûtL=MoxÍÄì-ºAµmrEXö X:ÞXÓ£°¯®Òù
Ýr%'u"VþV4[ÞK»3¤Ý M4vfÔTrSSÈQð4¯~m¸iøQØÌôLªã¿oG\ç>I>ù>%<ÁÇ+¾µ&9ÀR+Ê95<}ÀKÁðM ng¨B¬Â«O~KæÅKÊl¬}g	= àjº¾º  
ÚB c«¬cÂezc0lÉqÎbÓûdKýìÿxJ¤ÊØÊ3/0fýäjãêêQ_7=}q>1AAaç[À*çºBzNe½º¾iÜcV$£A3Ó7Û.ê¨Xqe@sÒOÿ+*<"²gP[Jè@¹\ÛP= ºÁ¢¬=MpT/T­c4üý×IOºé5ñîëàá²&Í-OQbR×AÈ_¾xy­òÐ]ö,ká5½7Íhëèb{»VÞ~YÛØ .Y{0uxºÙ÷³õüÂÆ¥¦þÔìbñq¨±Ö.AÎFÈØNÇ·+ÊÞ6AóÒØAµ\Æ×U!ë¥ïçmSTVüºÔeÊì½øb¨£T»×R® ð ¡ÒÇhþ&YKd:ªÅ´ÆzÔY=}ëÛÄ2cëÌh;G[°/&çk/qrÛÎ°Îº-mM·#^ÊT°(<Çí®vþ%ÝÐÔ0ë¬
Z+Ä¬+Û×í0&Ç½Þ:¦FÖEE~G(Éã>Pl£¨æY('Muå÷ÄgÌ= ÔÈÐûót0n.¶A5[×ZË2®QËi"ìT"Tp2 GWbþ|Q2kªB!Îvî(3.7b¾üéJÅïË¦NÌ?z/ÎÄoE=}w¸ô\ÆÝ©9}vÂ¸6íáÛzÄ/{Ã¦Pã+éÉ°ã2PVPxãíOåÖþR3xq*æÜ=  
\oÁs	½T7ÞhYo zK¸ºª´Ê¡H¬ÐñMæ= ]_
K8uØüAJkyhÌ3Ê #"m
7MQëA"Ka Äðâñ+D"= NKÚØd ;Àdâ;aðOÎ|ÿjoKÀ:4T{ÌX 8wãôk;þÅj¾ùXVú´BX'ãôD¤= Î@úñgeÎÁ4:pÃRÆEr-/òT¬²Xþ§ã«qB1*Q=}q@d¤9ÝË;70µnËó)N8BY½²ºHÕ8GUVA%-Ú÷³= ò¹c¥Êµ,= ÃNÚ8ñ­aûÅç_´{ÜöÔÊYðo2[ó3_É$N§<aRÝa¹ü'í  ¦¦o&}ø\= ÑÚÑ^1ú]8Ù¢=M¨i®W¥GLGJFüýÆz¸\1¨d£²ÔMÚüfî9¶
9öA*¼³fTgúùÄj¥äöY5¾§8Å©úfPþçº'U¢I©
fÌDÑËî±ÈÏ,bÕDtyÞY
{ÂâG(69ÁÔ¥ ÔF1b99iµï7ÑÐÓa=MûF,	5µ·Eïaõôv1úã@]Õ?Þ+*ñU#R=}°ùv¤37¢±ãPê%q¤½ÀùÝ6Ø­¶yf 7z¾¦â%uX%ÿµJn¦­Èµû]Ùª¢jâmx¶ÊGÝ[§ÛÔç¬}óð¡Ëv¯¡[8¼pöÉµàÍ1Pÿ§æÛ«%0]ÌEßyO¯çµ¸ ÕÄ=M=Mqoª¶ÖSHûÍmðäJÇ4Ñþw=M¦±=}¹à"~ý>B=Mz¼ç«Ä£1Î~­¢SÏâ¾8~$ü1]_ÍT
e!ºó7à%àJ³j;UØåëP»¨½Vþ»ðZ³ìY»Ã¶ð¤ùÀãQ|Øï÷ô&ùôMíy{Bã·¾ódR~öÎ¹þð|ù;»ksNè1ìð'HD|Ð'wQ¤â
~¤rDÀÎ%/èñ)såTÄDZI7PR'ðº'	&½î¹Ë¨NªêËkªªû<y+9à= >@tÌÇÑiZö¾×X
;8á¡º®hðÞ÷ûEx¥¶øÓtí9.bºÀ¢*Eá\Zzxéªuì=}ø=}Ã3	¿ÜÛ~í_ò¶ø_
Ò°ÆcpY±I=MäMar3ëhx¾íu­ùùõ< 20=}ù^àÔ÷¶ª=}-)y*×[Ù¯«·ÀË×°Þ9É×ë¡×å:å2Î²??ÒskÒÙIÊvmN újâr!¹Ðuê°³ÑêDG6 üzÁTº¦çÈ ºêÂççèµ	ôSdè¬´éÊ?þ!H3vLÅü^QÐêbç' ÒÐZ[M<ÄÓ=MneÖý#HôJþäãfgÌ
ÉlYc^Ä	éW×Þú$ÁEôQË¿ÊPy= ãÿa)~«CÞÎ.8w<kÔê=MøÂûcò§NÈÂ^hÂ©teaK<ùÚr¼/õvuNÕ©(=MÑkh¤ÿo;«Sà·»s,´ÐÎÿ{Ëã¬ÛÞa½N?æ_{®áIñ¥«2+ò5ø¼$ÄEò¨*=MGå7CëÈE¡ñ«S¼ÙsB|"2qÆ+#ÀLY²a¾OæóriÚ¡b²+m}azglârÿè²,ÙÛ¼³Î~v= d±SU+dwJphHÄÃïr];dw]2~nºóËÅÿÛèÑXË¼1°ÏjIá¼äðOS1wD/:lÙÍÐ=M+8E³/P®s¹ì= ÌY;2Ñê= 4ÿOx;Îbò·#ãÑ88>ÃV7Þ\ST	îbÄèÌ/{Kµp3¨|D÷Ñ= îÓ ·7Öum(ÊâHQ|Dñ´²u(OãcÏfÆ5
)¶
-û}ñßé#$XüÃ±çÕù§Ì4ß6è}½%Æ9¢õR.É%=}aO1Ç7ÀÖØ°Må®%%´Úú±uöýÁu~õ,Vz8ûXpä+&Nuªpb<¿ú Í*i½Ó?,)sË%><~? SáÚÿ1yEÞ{xÝIýÀ»4WóÍ¢>âùÂtëØêrÜÂ,²ÝJÖ±À~Ry¢§Üµ¾9RµwdeT¦Q©ùÆ×ÑÅ/ ÍÙ¦xrâÐåìÍìÍ¬ý¸%WöÑÁøpíóÙµ¾Écï©\«®¯³º¢ç.Àz¯Å®ÂMÙ_ÖìÝXÑ5 ­¡¶÷¢Ø«BarYA9>¥û¼D)â¥a×s­óª<³Oã#D²ûÛÀµï]°ê= ñ5ø¶'ÕM?Åö©È^¯ó¢d¡CH©]1ªX7îeßFç:¥ÄSsµ85	­G½ZyIj»VÌM_7+½óä¦åÓ%©÷Ð¡oíÈìÛUÿ§dlÚ®]Ì]øÎ! 8ãXn,n<£åÊ%?âÿÀ~â¡ó:Õ¸UÝÆv±¼=M¬¶Øs1GY]Eàõ fQë;!¬®Úù@vUD¶W.¿ãXü¡ödúÅ%XñMW= õùSxvÎ÷Uuræu©ý£MKVøÔëyf±ÖéÅ¬àÎ¹ÛìãÈJ!Ö3pfêÙµÆße²;W!±þÄL1W¤hÕ®á¡ü¨Ñ_'uÞ;Öï'ÂÄ4tN	ëß+âlBóJqt/e_F&SÏ^×¸4QwëöV!òX¬=MMÐ-0}ýç¿_ßÁ	nÀlÃó_P>wk(gð#CÈRKÁßbÍ=Mõ£NÒ.¿êé¥vÃ¬-A] ÑÂN¶n¼P³¾­ìÐ½è'¨S7¹QÕÁ«¼¿µ½Ñ³í|¬¾n¬òPÃû¡¨µîæE¯"rçÛÜND  §CßãÒ
|ëkSy7´±o³þÑj@¾SQ<¹â?)ð7pº^·¤Ì¤ìì(|F0~ùýâáñ¨t3s¬®®¿«js&«ª+MÎºâÞe¹Ø'!ö:»8@lbN,q»âQÓÐ¿P}%·§ñráìyÚ9ÍKÅ'íÉäææ©®¨Â=MAueØ= t£bxÜ.Ì£ßÇ;|Ü®È\2?G¦~r±®hF6ÇÅtN¿wX¢ OBñ:¦ñ¦,]-/õ²D£a1®³op<mÞ/{Îú[ÓÑ*u¿	"ÁÜYë´Ð0r¸¸ÝóÙ»×Z9!ÍÕ¹7¼¥°>×Pí#u¶§ÿ£×jÑ=}¯EÕ/îv?åÁiÿ=}MÉÉxw­Ðà¨ÒI*uÆi/È ç,$j8eè:<=MhFÛø	
IJÉv=}[x­/·n¿så5ÃÄàóÑ@¾PÊ-#²ÒÄ<F'>éSÝìÅ\m
×3âtôRôÓRnxàÖÈÂIE®êy!¿ä74ÁmRÓÖ¾fÛ}§i­©!Íâ7tf,[g0¥R©®Xüjáù!à×å¾aìú BæâÞ]©iñËÈÝáy>GjåäPð¼¨÷kD/Î
7FÃ4= åKêzhGpÚX|á°<DV¶ê)}ëi¬;|L ÈhíJUtXfóýËViÝôÜè2\6Þ×Ú;ßã_nèÝ)´²Å= g©¡E*e»¼=  Ò
y}^¯B±>ÎLÊ=M[©ø²¥ùX­à¦
tpÏø¡túP4Çto%d%9"¹ÌËÁmjûíÒâÊÙX4ôzÚï}Ýjæ.&6SÜNf¶£xINÍ¿­®}?Q3N jñP/ñQfÿÍ¬Æ­
/"Ø])o4¤Dºc.YÖâú<ÜÍáå\äú½Y7(f|íâi\ ×ts\ãëÚtï	*fÕ\(ÒKÁith.µèCÇ@Áòõ8@PÓÝ#D1=}CSIÑÂòyõYEePp\k0þ(Bôoû;$z>uëäpp0ÜldJe:*¹tO¯À÷,aÉê¼íG]ð"8AÎ=M&vTò±ÂÙ²¯}@Y ÙÊ(êå¤6ßý5RÑsæØQÓPoç¢cÜþBUÞ©kKÔÔ¨ÎàüADê6K¿òJ$D-5#¡þ}¢®ºqoLi:5 }Ï= d\Ã
±\,6°HJ&¢kñª1J&6@IÚ4wIflÐs¹Î'Ç¯xw²«¯'Ó H|¿763oQúxÞÂ~lk3?UKê3îøD"ÖñÒ¾Y'D!þÁÔHbø±BÐtÓêXsLg·ùRþX¨&HÑ*f= ÄdP28Ñ7?V47Ú¿ö	:KÃ³Ò0#owõúýiÓÛ¬fî.õdæÿÁñûß½Uë8ÁsÚ°X­}~qÿC§ûTÉrâ-È+÷^§ h ±	ù=MwÑÈS?±òèZ."½O¶]z*i:© IÔmrí0dù
n»þJ8M_#S>.B 7}©íFWinSÖàìÔ6i
!{¸«C6= W@Î/[(BòÜ+DpMº0"Uz÷Éï©©©©îÁkÔ¿÷fñÀ.ã:ÔSÂÇÍ7µ¬ø^ðÚ=}=Máêsì'd>]\*zÇñÑ¶,:z)ñ¸,ü= 
®N³¾Hv[vCÈ§©T}?&ÀK¶	_¦ÎÄÙ:ß#½K¨ÉÜà>$¨×êHÅ NfjëÙÚD 2YüxÈ~i¦¤¯[TÜXýÝæsG5"ÊÕcÛÉÖðeÀ}®pËDpKòpKpKpKPr$æCJD1yàÏ°x
¦JÒÏ¶q,¥×ç´f =M %wÏ È%èóñ86Tè"ö±¨-Y©;Æîaö³ íY§+FêA¶½÷¸¹çÝ¸Á]8·ß½8¿ÿ=}8»ïý8Ã}ø¶Ûí,n%"n)bn'Bn+n&2n*rn(Rn,Î%Î)XÎ'8Î+xÎ&(Î*hÎ(HÎ,N% N)= N'@N+N&0N*pN(PN,%)\'<+|&,*l(L,%$)d'D+&4*t(æ8a4áõ§è-[¡ûÆÁõ¦àí[ëF7¶#'Ý¶"¡G]¶$½6!?=}6#/ý6"£O}6$-«iÙ¡	EÊÜÒg(n10ê8¡,ÈÊøa)þ® a°üä-3û×ZÈ8ù7.fÅ^ám=MGáÎ3</°pä(h	Èú|®Ç.þã1Ò= sc+n±w{N33{= þa¬/°d ZÿRðÿ¼,nhzÀR_dëPK[Ò r°v.ÝdÛÕÇ÷RÈcPx2&uAÙü»ÐÐÚ¢>ÿÞèèoÇj-:k±Ê|?Òä¤WÑSåäÚÀfø>ó= ñ6¿®é= 7ë»
Gþ%æ8A/úk¿PË®]Gè;rG*4AùÓ¹¦Èí\ÁkÈ(¢aû¸ÈoYAËÊHbbàÈÉY#b	Hrf!Ëò~äSKT O|õ³.XÒ9í$cxR¹ü1wAh1HdçXNÿÎôâ¬?÷Êó;kÀi*oDjXNÞäL}ËÒs>lP4s´%VXG=Mé»ä]{¾®ÒÀ@|ú'ó*vGà;_®¹äúNTGV¡%2Üs£+mR\\3ÎV(ò4?ÓPH|±p"àòÌÐbéûM3·_fÝ{2×åÓÔ= vd×­:D Ú $¸mdÐHøä'"ÊêyT.ïF2ñÌâJ.ïlñÿ«o~iKBCìLZaQKZò	äÀõI¸=}Éï2Õµ©¥á³ßUÖõïk4µÅÓ¸=}ö5VÕaõ5±V@øe=M=U=}úænÚxÝ«gÏ«(Huúe%Ö§úÅ'vx®á&%v½L= V&Ølç/[ éÀ6°=}µ¾ÆnÖCL»ÞV2WÍwxªA¯wçÊ)Ç¢M¯ÉójIH0¿0ï7FV§'@ª»dHüsa~|î0ËÅËmuøèð-Kp	E;²MVeþ±µCFB¸¿4Ï×ì¶[®(´Ï0xèð£Wì£[BCÍY¢NØNä O¯ÒÖ/VÝQæX°"pµ.ÐwyFuØ4®>êµ!fÖ­aXiInè½Ø/ þ£ò«¥Hö®ßÆ©OoÅ"v{¸UîÚV©´¢6¡!À÷ã±3¥P¹×NuÓemæþýx|ë=}Á[[K%o0t±êüÝô'ö±($ÏáÈÈÕÑH5q1¢Ãº¬O,¥ õ!ÀÇ|T­O::¥_bztqjCÅjÅ5¼!Âx8ðô}ÔÕåÎµ>V5ãV %ïÙÑ£Y{ÕÔ®âµ2¶ÅÅ5¡ä«gôÁý;¡J±WêÎYÒP*5,êµ+ÿ%Ã¯e«uïÖ¡LuÿØ¨e³ã%cNÕ}|/uØ'Ì9Æµôt©	ÅYðv¥à÷ÕÙÞÂÖëLé+¡XUá-¥= µ²/Ó+ª¥¥äT;IýÆ]I*µærszY1 ¥WÅºýzüÝÿÊ¦§Í×=M÷¸+ÝPÐ§GM¶ª\¦kÑ·ïÜ=}Û·}ÀÚ9[l(6ø®6» &'ÇiÉÆAò= Î\­æ)v¤ç+cÿ_'©+é£ûþ+FªÒ÷À.Ö²¸8òùg;ÿ.Åÿ$!Ã=M¶Èmýzg©Î®¼|´*è,04×íA5à¬½¼¬ªy)2ç_]å¯?ûÀþ^ú:cêºJÃìf÷_eRßÔ¿c.Ö00)#ýC»¬@i9núÊ2gñXT.9¦sl¹ XÏ Oíß¼Pîâãïgh¦ë
ë'og/®b´úâ(Pm2DpüÇ~2ÈK©Ð!2I¾hs%r3C~wµ±=MµB°ÝmÍ®iÀ2Îc7ªü[å¬ÿz]&±ÞÂ
:Ói"p»+¬ïXoHïû/)rsè}ÕR}{èóNs§ìØ/Ì®Ô¯bäátyÔíPKvÕöÃõÎ¨=}MY»¨	áÅ¨äLë#
ì©MZå½Ìþ0ªWâ=M	[®Vjï+vîÈm°¢Þ]$ãä¶·ðÃÕ¤ös±	OE³øQ$·møÑ
7y×öÅ.Ç49áº~r%Zë´Ý½ûðfáz38açg4ªþ¢KQäÐnPúo7PëzIè6÷¬¤URÃ?Ö0fÇëè*àÊ ÑFý#F¯EJ{Õ°^öp~æöË}v2YÄûñHq6²jÿ )Òùt¹T¤ÉÐ+y´±paf
õò>ö¢];JfFZü¨».,iÖÎ8;ø°p&lÚ~ÁÀb®O=}EWÎúc érDmnü¢K¤¿¯\ÿÖ^Õb§u ÖÌ äÀíÁñ»Üyúª/¤IYRÓu#,pÅë¡p¼iâÚw&bÝ¤=M0&ð|Ü((ø®na#;¤­Ü®G¿à»¢g^«.è|½|c5ÉK÷POØ¯ PëZRØ(²c1Q¼5Rp_XÑ¢CÂ~\t#!uÜ´ÜËAâÁ¬o=}Ààn¿Ô$0îi:,m$[ô¯o%ÊjíQBêÕ| ¾f¦jðàÁá~µ4;XmÎ¡ÿ¡¸OÚp	H´ø;)²ÉHëû¯*=}µðÈêjàS=}t+|î~ëdE(¤Îì =MÀÏ-ÓD£»àwwB~ÅýgSrI9Q¨*¡Ês©Kb¶Q%o£ÊB?õv«Ýp¶a¿õ^K»Lñ=}óB§©<ÂÌÃK@Fóyßñ(c_/oqKàl,@ÿÙt	¼±?¢#Óíê.ïäÁ¤øÑÞ/q/+¢FSI= ³?Õ-æð!oiT0´pÅ©;Ó{ÝQ§»f~?à,Ä}EBÌ°vÊAM-ÆNNú"ÆwjÕZº+äThä³ºih.ò·Þ«»@ms¨MìÊ2Y¦â XfANh}þºµpÍINÝdÓAo!u\7²5ß¨Eé~ãUÀ¡E'a*<Rì¹%i ­m°)Úèå*£)úÇ ¡í]µß=}5AõMU²Ó×§%C¥KÑ{Ñ¾ÝiÛ¬¨¯y8
Eèx¬Â]ßþ¼YÌ¤
EU¤¡t8Í¼Bèð¶ÓÇÍ]hnïøÀÁbdáþtÇ¶¿Íe HJµU¹VÒ_ H/Sïü°ÊøMf	Àb= }qË¾k±GL@ÊîåÈW=}öë)(kFê÷	ýèÔG1.¨*ØÄÀ]ßü#DîTGÖiø¤rJ¹Ì70Ð±Xg°ÌAîóP#m¨×øýù¿9b¤Ï/~Âu4}á[Ã$ÍêD0xó{[äGÆ3?ê¿ÑÅqÎÑIÓÑ±83ÑfZÑÑ0@¥ÒB¿ÒWÛÒè{ùÒ¦Ò4(Ò= G:ÒfSMÒÏTaÒéDvÒ©Ò£ºÓn§ÓôÆ´ÓýlÀÓxÍÓÅçÛÓ)´éÓTÜ÷Ó#[ÓE,ÓçðÓõ¤$Ó-z+Óp3Ó;Óm°DÓõLÓ¦PTÓÛ¼]ÓL7eÓ=M¿nÓ)PvÓ¡èÓsÓÓS¥¡.õñà©ÕèJÀ"÷pKNÆ«è[ûpKÈAQFÒ,¡]]ï=MtasÒE}X=}iyc±WnO¦Ék!¶äÆ×<eIÓâ"ü;®ÒAÍçØv .ÈøÇqÍðÞØ>¤Dg>Ê·:º¦c|ä&yYEã±#»§r#<¯.æ®=MLdw2![KÎ]ú]Ñ2^¼}°÷¦$ëª(0èW-Æ/ã_.¨>U&Ø)Î=}9	PÇª@K>ÍëZ}gVs§V4ã©Ñ»­=MâÅx&ucèVkÌ_$xôìTi+ÝSît¹Ä¢àÄFAñXùÏ=}Úàt÷=}ÆÉ9¤góG§OêâPx~ àï¤¾WyiLë>tTª=}+{=MÄbï5ñ0:Ø>Kéî%ïåÝ5KèEü2um÷Vµþb@uþK5µãu{Ä]I¬qj¬ÐñE=}@uÌªïêiñêUj¿»>Wä=}Í/97iàZÛ¿ó¡éðª
âßÃ2ç'MãxDß)QåGpÝ^*sßÁsÀ=MîV"ñªÑÞì= îV&ë,èòc{¢	Àz"&h\éc!ÃÁ°ßsîWWo§Ñ÷:IöT@,58-ÖÀ Â¾;Z:-x ií¦3h ]½7J¦°´ªûâ¶û7¥Â"×ÇdªÅd;¬åÒA [Aì{ìÛÓKOmQcxâ-|zö%Ün0ñ»aúIÁ,ÞNb6|g±wøe¯-Ø@njú8{1b$´ÇK^ý0¾8xÝ®FÌG}ê0ZåpÁûR= z.ûGôÐ(gr®ÁÞdõeU¡ó1áüÕÏ Û<Èç¯PÙ¯s¨gES/ßIé[<÷=M¾ty¾=M!Ý¶ùÇlú^Á2a*òÞÙÜ¼vqÓOú}P»÷ÉTÿ§/1Õvn=MsúYî¼3@wmu±¼RíOczW5ís$6eÄüfÁÃ"[ÝÉöp7Íz®ZqÝC]¸&
 ¹þ¬b·ÍÜøW°äþ­ &HÑ)Î»6áÓ³W-5¥_¯_¢Û=}h<»S-FÍ%U¾K¸ÈPqãat4JLý¨\SëôïùSÓa%Ì|ûhôr0 ªók7S[(tÐ7î|VHc³miOh6(Ð{êÑexhìûK
Ú=}ñ=M^.c!vYHù¼[Ò	yû=}¸ÿ,±djjfÈFü_ïÐ«#E8{ðó}m/¢tïh%ýbm°euð7ª´Lù##ºz«L/(´#kæÈ~0Fû3¾PIâ¿ÉV|6ÆÌr"IjI6Ûyê­*6Õ4øfBhXréCãzjÓòÿÜGCä¼Èr Ç°¼&g§ø»'[»¨=}ÑÞ´\Ïý±ÐL#ÚDlí\EýCã¯âz½+Ê#¹[¹À{!ÕÍÅÑÏ£¸Áÿ½´L¢öél¶Ñá¯!SÖ	Ò~~.
£UÃ8ÔÿvhP´Û>nE<¤O¶¾CÌ K7ÕR¬¤=MÚ¤Y|cIPfig*û(Ca¿WCÀ2>²f.Gãýjö(+£4JNLå M|/)/ÿwÇàjüjîlì²m#L?ÈtK< úÁüL8= .K)= EËYÁéx¼Ö­Û¥ÚEKp1qJpKr[KpN"pK®*)¶mq±YI/SØyÕ¤«= 	¸ù¬
ÏÅÐBïöQNCâå¨ÿ?ôÒ?NÏ}jUÊ{ê7ý»,Ö¾«¸ä¦S«Õæ·´xæ¾%Ãî½o-³ 	ñ/ìo¾4+¡²~Ù9£Yx|Í}j[õ2ý]^f]HÅiÚ9ÚÅ«c ×:¡Xk3IÑ\CñôI±VÔÄÉCYI#mð¬!¾	W:ø#m¤j*;ý;ãÀÉrFY$í}-ö$6S"Æ[¬Åàh/M³{.~õ\=M)QeY[é
á«æ!!)S·a¸z6Kæ£À©ú;æ@cÝ×\´ñüÚözÄmnÜmxÄmS¸¯Às÷!zÀQT±qG¼M,jï&	{««âS#= =}ddwûxÞî²"X]2
Ïf%(ü,Í1Àèôß¼õtB~S¦³Aoqj=MªN±4+µr×Qa1 ò>îMÃÍ²:(v8Ï¬Å«/
¸fQø[^gpg»§¥D6hÿ:)é*Üó)Ö8Ê§¾M¿ïº×]åZ4WßÒ}%¨®]íhZ±¨Çn9ÜTS@èü1âó·ÚÇîÔ}e<l	cÒ_	PÕ<£h!ÏÆ?%s×ëÂ<Â»Nô³Øóú¢q2þq<øSqy4ÛqÃ,ñ]þb·h­Ò°ÔÈç¤R¢½Á Eëñdr=M(ÄN¼\0Ey$m±SíP2t~Ë3þa0= ©TD÷H LHúîn±øÛ(CEV¬¤îõwÐëÐ¤ð±Âb¯ÓÀF°ÊnáËµþ[kmG1÷üËèn ZEÇ)n@\Eýßû¬?ÈnÆû¾æc+lGÂAÕ50~¤¨¤å©UGlnKpKùpKlnKpo?{wÄ¼ÅöÛ¢¼3÷¹¤÷Íåà­ëÓ÷}/'ÙVþî1EæUcºýqF¡¯@væQ£Z05ÀW8u®³-óq$rKP½k4Yy$È/³ÍÃ¸WÊFMP/ÐíR9ôÑ[Ðtü%J0tWñ"!lxtåQx¬Ú·Së[ÆÞêÙÜ?6u/IÊfý9"?
O-:L|_ùøIÉF®·sîÕ.râãk½tú Úoà-1to®= ÌOwô/°³sÕs5¼gÉQ×o¬¬eÍ8:Å®¡>¥1h XnÙ÷xýy|[5±éOxö µd3ºûÞéÝFô¿»98Í¾ dú6>Á°W¤¦s&i$ÍÑæ
ZåúÂZ¦rÇQ¨=}UQîº»º?= CG
Íñ$wZ"Ý	Ug«UJªÎ pFhN¡òíÿl¢¬óËÄK}¡×ú­\"µ	©Ó[ænÇ0;EG¯¼#d·Ñû£ÐZ®½KïI®¾yÅ¨Â0û7Ò6aÉ/CÁû:À*AÉÿ]ÛÐ$H(¡ÐNåãg({7Ã¯ëz»h²ÑémZØQI·´ùw<#åoá¹Y^Çâ%S f(zW©å¿á[ÿ·YPÚ)y°Ú¾XÕ!ÍèÍ2É,5(¹>;Ü'íA9½vEÉßh¡ÒÎ½àÄÐúþcí#++</[uÕ£}5õxpKpKFFpK£ÄÛrmKbý8ÔîkOùôkºã;\Úò³1kÜ)°EE¶®¢î3ùÙ^Ì¸íÿa¿ä¨tÆv$ÅÚCø[m8û¡bÆ\$Î¼,ðir'ÎlÁÎfùÚ I;Óq$¥8<O² pÑ_3#¼¡°zUèúÜQÏ7©yÙjâ¼1îkpoúÃ1GúVÞì³¼PF|N°Ôú±´yÖê³±HyæäK\=Mx#¬ø@Qîh°4¾ÓYÀBÄ¤B]þ¸Ó]4cH·Âd¤Íó¦ÝdäI= =MoÒ-^èîÓ¹X¶}=}Çøú½jö±p¥[hoL(®ùÜrA¸S¸'Ñ@½ñLÜ6Å$[ÉÛÆÑó¨XØBí÷+Y÷ÇÇ#_.ý"\áÑ¼S\EÃ:|q^Þùm*ÙÚ¹í§[ã^	n'!4ûÄü;P ¿Â>9Óáúâ×¯F¼h½Gä|	ã¡c54ÑdÇÍ0-lFáéÁGÝó%ZLÔî¾^;ynmP{%L¿¤Ré& pñsÏzfüþ³8|&/0d1¨í­«õÍ6Zx1ïô]>ÚÁ^Âwt2Úù>¬¨nña'Zí+¥ÓF²à=}ÂúçÑÀz/®¬)ÆÚ®ç4o|*(I1ýëâDµãfË*´êÞv¿þiCwãúª@p?ýè"ê÷Êôìê8G/ãÊ©$?ökN¯¤@zÿÂXìlGÞÂJ+
A?@X}õ²òiö|êd6æaÐód^¢É5ÌC-¨¢1o]»Ûc= ¯Îq<Û/}½ ÷gO»Ëqÿ×Þ>. &bQ®láðÈØtÊ8þi¹BH®Â-´ Ö6òXë)'ï^-e_Bñm_Ev§+Ý=}D)EF:è§Q&êêßCT©J¾9Ýo9}q,7qÜÛ:!LFÇÃÉ_}Ní[Ë®Lùi+Üàc§ÄÎ Èz,_îNíc1Ã1,(ï#ô:½m-=}uÝ:cÂêLü©AN6õ°PÛ¯P/×[¾÷Öê85|íVh.jú°n¢À<x¸­î+µ6UN5"uVV{ÄKjôT¡aò©ÕV9KpäpK"ìpKpKpËÐoØDG\ôS©+ì5e}.×0v¼ªèñ=}eû9×ÑRòªW¿¾Iû;jóÈæ¨b±àÇ(sr!ô¨S\áá®ø7Û(jáÏüy~Ý¸sãÛsÌ*|æ±= ®MRÞd+½Ò|Â	ï9x!8#¢Iqg ?;:Yç¢ºÿ4ÿ³>ÎÜZ,ùª?¬ÚÍúª&G%°>ÁQôUE3c<Áí(\ca°)= 8,Î!= öwÁ@úÎ¼ ?\Èno¹(x?¡q$:hLãÏÈ(h]ò,_#¾­º(^Ò%Y· ¹·§®DßU êÑøZ¦óÂ#ÊF!d6ý_$÷s(Ýc+"ùïPOÐ¾!N{å³ä£vqõ§Æ	µ8e>Ô?}Sgx,¤À=M$¬,Ç0zÓM¨q"yÐCM3v|üBwÁÜ/¡
U¿l3³Vé lXme/Ê0Ëïf 	ôk»6.ê»ëÚ^PÒÅC~cØÌM:jÃ±MkúãÜ×§Ïuk7Ò¦$oÇÖ°ó[I»TÀïóýÖnvbþÃbåR×"N¥eÜ«¢Fòò46Mýæ,O= ÿH^P«ÀsluY}æ"è¬@u,ô®*íIIÛP1Sï+®nú=Mî/r(ßçLê¾n^' ßc#ôxaÎ ÑæR(:s Z,DÈòFý?Ô%6êß L¹A
þGÁ
ÖãtÓÀ ä2'\úW¸üyÖ>èEäÿ« ÓÐyóBGÛ.2áóNï«¡ñ¶üX,ßã ùZf24Â|b%PnèútÞÇD=M>ÿI)1Í×ÇXßÝÖãÔnÖ?Â'2kÎ?=M!,¦LÛ%¤+Y$Ãw§ ¼ª¢ É<ÌKý°pKnm;>pK0ù?oûÿ¼
C´rzÔF¯Bí(ZýKõ.= hú(7in"OVA=Míô»+ørçõ¸7Ï³ôXO|×ßoÂV<R5ççÍ¦PÜ-·TóíI
65ÇÚ}p)º)À .:E:ýeF@ e¹òJ¢fóú°thrï°6Ñ9Ûj::KxYÏTîp
³lÊÜ@ßoÏgGDáÿÒ«ÃRÄÄ)C0ÃÎ	Ã&¯·ËÞh#,×àgUI»þJ	ìÏp*)³t¿ºyæ:YhÉKH<96qáÖ(n=}dÈs­¸päèuØëMÇØôSyÙÅ¤#wC».6~c8±ÓÆK-,ÓByÖ?¾qçd$4b
ëbxcl¬= ßàöª{ÿóM²¬ÃyK2²?óI$Ôí
%,¸mHxQ{´Êq|+<NUÎ³.ódxúâq÷vúóL¯,Ð(Lisvhdt|ÏAäb0Äc0D=MpJLñOTÔ.,3vSê vHohWã3ú»"VIDÑóìÀUy@·o7)vj5Jæò&N?°Ûj.¾ÒÆ=}>¬áâõd1Sí6´P¢Õ+]¥ã¡ÖWs6Ç±HÜÕ
P¯Ãé\º¼â=}Ãi×zØ}}}7³O±eZÌá®øKøaÔýùúÉ\íuo'&ýÿ­À8UýÁs"XD¾xfúTº)ïÖSh¯Â¯KMµõêÙWPjÝÐÿ$ ,±l Ü¡vº¬1¥âÌ±È\f³MúzN¬é^°ãa"ÄS#Ø.Ô_	uÆÍ¥â?ÖÐìóXïä÷OÅA>£\ÅÝ©"D½O§"º0øeTÍ«ïÃ=}~¬$äw¶äUcAÙ"áAÊ(v3*ì>Íª¨¬:6W¾²T:x}.èB®=MGÑ¨Þkî%¢ºn0)òÎMäNm¸¬L¨¥Ê¤kª](ÄÕ|!Ñ~ëÓFáJ®èÅT8Z%ó«x×å4¾V¶(çÁóçoÔ:Å¿XoÇñ³ñ#Ãz½ ¿N	¿¥?"rÀæ±çmJ*-Q§dI?å§ôlJêRèrúåE(vÕC¡ k^EHæ´ÂÇ©¢§öýÂ7x§¦: Ús¶÷,¹÷ê¦ð4óÙ_¦oJ«´·RÂgKl·.ËéNÖ9:.·*.ùgÁ8úibéÛ	OÑ?]B6'¡¿~l;'æã¨= ^Ú®>r¿ºêZçüñ×ÃÃZI¼97^ÇIò>4þ³¢ì^:
GþOÁG ]¹îL¡_Í)ãØhýn©ÿâä»Ë&ûÜºe ):´àGýÇM­ÞèÛå5ð­Ã¢6nÝØ5wI&¤ÞäQ}vò¤luÛ*ò]3¨n¼Îe*&<ÕÜ£p%Ø/ªÔ34±ØhÜ&v¯å÷ß^²ÛÉKqËj: Fo	?ó­=}fcÞX}kVy6Ê%!gfwRþ= H³éfD°în>åü·R.sáòV·Ez TÆ24-6Ìa{J¶@î0ÊëñúÑ9&ÒÊÍ= ðmX\í{ëBK ÂÿmaÇkGázz/As=M«ÐùÇ@d¾ü/®îAäé±È	¡ù2¯Ãáx<ºhÐ aKaåø;Cí}Ôyîw¼v!	Ø=Me¹	BeS'åL\ìÝ³ÓéínJfkýP"~gÐÊ;ã
60Q?:ºR7:³È::ÂçëÂ,IgàÓrSàb_qÚC»top1HLzÞ¨qNA¥Ø·p0= 2ì³èOnQz·sx3·T3¸ûÀTýÌä\Ö	t0]NffvH»SêÏ³,¬.Ó{Â80FZÐß 4pô;"t!':2Ñ³#åW´¿=}ô ·½A¤\z@F<C.¡\eÿ]_kY²±ôAWö=}ô!ZbåÐjôÛvMtí¯=d{À=MÍp·¯X=Mmö¬£ÛfÍìÑÜÛ¼\xÄ-LÔë" YvV]©Êöí¿ UÊ= ½¹Q zím.[¸ékM¼vßØÇÓ>ýs&?¨5´,5Ò.å1r±y÷ö³ç|yØñîÌ@ F	¦ù¨ FÁ6LAßöCé
ú­¹À\§Xý?ÕºT@Yu¿E\êE&ö«®Ã)V0íèÃwm¦ÀD ½wÝP¥þÞHÝ ë	ÞÜ¹= ÞÇÑéÚ	Q'!{ìeÌOêèß*edÚ	>=}{æ= Vø&Þ ;:(v©Ñ3Ýè«\&$ðÉÎt¼«×[¨½B¤ZÁ5à®ÃÉÖb¨]ãbù"6æ aþ³¸Eã,=}åGáæZiXLÌ:2ß®r©^ctBëkg/´E\DE®ü-d8a½ý¼ôT
ó.dGóâ÷ì¯ÈíWûvÌ3rË1JöþìßNêãP0ÅàBL'%o¹6:Cé7)¯RòÄÒ'ypê=M=}b\Q¦«hÅC|(dÿâxÈª¬Æìlp*}¼eÑGÏTÆ#lôV¬1)ó.§	ÉPøÓÝf°/víï¨ó~VxÆ×ïµbíáKÛ|ú#Æ#=}ÀÚjÿäáî~ Õi¤ÚwFñå ÚñÑ*¼vóÛ¿)\ãáaVªÝ=}¾ÕxV·¡)*u<ï®É,)¸Wp¿fSÒ= å}·7lÖ¦ìÓ \ÖÅ¤ZNÿX¡#P«Èdõißêv§µUUZ½b=}£,Öêæ¢)ëXZý]ý\}V­U*Ö=}×ØÛ¥IW[=M[É[±Û-¡×öÑ¥«ÆëÅkÆËÃðîW]RÚ2Ý5VÄÃ¸D97;C>:B8@<Dýù÷ÿûþúø ü}yw{C¶7=}þõÿþuy~x¬¥©¯³®²¨,%)/3.2(ìåéïóîòèl5¶Cx~´±³²,-'+.2ôñëîèlmqsrÌ_I.H|ÄóKbO"0*ú¡²·(H ¿ïÏ¼ã2Î~¢ðÒz°³ÓæÚÀYoc¾,BpK^Ì´TðånÓÁ@O[g"P$3Pnpô'{sf.:¢ò(ûÂñF= c¼ÃñTDé±¸¯»aôP]0$óZB~*sÅb ¤Ô|idïQxÑ^j¨+Ð^\T1ÏÀ£ñ4rÅ?VÐtn!xpë2ZC´óÒ\*L»2ÃõJa/uÎ@
Qè4îbh¼UÿèMq¤«\?¤í1LRº9åEqNþhËðê-uµÍFøp¼ÍþéÕêÑ=Mu O±iÕ¿5?c4Î{uVÂã¯µªåê6¿²jÖ¿5?c1Ñd3¢»ÖÖuKprúpKpKpÓÀpdKcawUl¼½½}qNX \Âööö¬Ä³ò©í²âSõÌC&Xþ{õ¯DæXkõ°mb »5´¦©3-\i4mÜ®ö0§ÃH= !û³H®\ÝvÅ0Ñ;AUÏS82|\ÎÇÍc\[6¬¶y+-Zði,JmÚ±®÷§¦Ø¦¬îÚÙ¸¤nØ¹%Æ;ö©¾x¿= EDýz¾ðÉ#Sî-Y?M^¿w¼Ï^ãñ· (C	|ÏÎ2ã;ÏÌýD0%Ùçe«ùÓètküÔ9¾®c²ßOq'Á|/q{±¼:XRøÛ[CL·33LÒ|^}=M4­,s'ln{úËèprkûÌ=}Þ®a¢Om7Á{ø¯m[±»>RöïÛGCKÁ@/k3KÊ<Þý´-*^Q5?0B_û;H,aúGÏn¬[7ÖyN-V°OXÕ¥= ³.Ùæ]«÷´eUËu±õ)>­VòßNWçAu ï=MW«1µ*¸Q »»)ßE§°£óE¬]y4¯$Ó&dÎ{ø£å\Òkö¤ø-^­WâNY÷Áv¨/=MY»±¶.ØQþÏ[%CF± Ë3F¢üÝ|­´/"¾Q9/ðA[«6 ìWªGÎZ,[;¼Vy;N.^0i	<ÊnÞ¯÷§âö¬ï-ÝØ¤o%¹5f;û¹½ßàH'Äþ~Þð'i#3..]È¿Pf_yÜÏf#ñ¹H¨û§ã|/4NQàòï,RYLDv»ü½L½ç H)äþæ0)y£+~®= ¸_PkAzðokK1ºRøù;JÏð*CóJÀì^éôlØøïdt0= ©eØ5ñæ¥Um^Lp-ÎFp³¶Kp#pKBââ!;7)³p¾ªäã 9ú¿pËª¢¿qs¤ªtÇéYCôµñô¾ÝGð/65púF¼Üöðfy!!ªÀg«ÇT: §ï¼èLÏ§ÓÝ5®p±ÅÐ,]r?f1q-ßEöe£)_Ïúf%µÀ{ÍÞQ?D¤¶à¼ÈItÜæ;^èd)Á®æw	gî¢Eüb8WÒmÓADX3<@=}ó×é]qÝ¶75I2aõ= ãÖ\0¹8¬²<UpÒ¡ü^ê#ÞÂÄhÚ<e»®üV¿X¿}h®Ïrè¯ÐC¸âftp¸?Üq?²»Y<À0pø<×BvE¥Ä=}o§+ÚsU{Ñ@à4g18ÆC|)xÌt¯Ãqp>#H° TKlUÏÍª|X~ÓJ´$½ê9ÕÃ6¿W×q_=}O¾!TAAq&Ñnï³¤#ÜHeÿ¦æÐ#\aXØ±O¾H(×PÁ	î)_´ùúÓ÷­Ç 6 ïCPÔÑÉSüÁH» üä#ÛIÛÈox¦D!ùÝ+^)(Æî¼Gä	.ã~Ë²h
Ï<Å ö§ËX½Aîm¢XEÑáXÅ£XÑ4öÏµ¥ëaTé®­hµÂ;Þoá8I/ûþÌ¢h/;Éãþ3øµ«[Ù!&í®ÈFÈ÷þáZk­ JÆ¬øÅ«\ù#fí²HFÐøá\­$Æ´Õó-¼[Ñ'ìcÈ|Ñ),cèÑ+lcÑ-¬d(ÉDÓd¾;¤W5¥ÖÛfÊrx¢'@n£tøl3òDülnJ³Pkülo4ò|ölm
ó24òölm
ôr4òõlmÊÄb$òùlnÊb4òEÀ´zZCm*¼Púìs_4òõìÔmj¬ò÷ìTmjÌ$òùìÔnjì,òûìTnj4ò³mzòómzò3mz òsmz$ò³nz(òón$c QkQl¯kG;JöÄop®1Z.1b®2j.2r²qZ2qb²rj2rr¡aWáa[!a_aac¡bgábk!boabóG%ù¹À.^ãG)>úÁ .= ó	Ö¼	ØÜ	Úü	Ü	Þ<	à\	â|	ä
æ¼
èÜ
êü
ì
î<
ð\
ò|
4«-õ¦ë-ö¶+-÷ Æk-ø$Ö«.ù(æë.úîMøÀö­7¡ûrø&w,ÑµK	ì|¬óÓd1Ì|dQ.ÔanÌ¼äº<$(SgôáT~ÐÜìü\¦ôwäôÂÁk¢µ¡YÕ1ê¯Aú^mô,a{óTN|qÒ4Òù´nà(Òúônð,Òû4n 0Òütn´¤wØQ´¹SY0¨$wèQôÁSZP¬¤xøQ!4ÉS[p°$xQ#tÑS\4³9¤~Ú&39Ä~â(³:ä~ê*3:~ò,³;$~ú.3;D~|tLÔI³<d~
23<~ÔÁlÖµ¥6÷sãëýÕ¥ÄY¤Ù¦Y´Ý§DYÄá¨YÔå©ÄZäéªZôí«DZñ¬Zõ­Ä[$ù®[4ý¯D[D°[T±Ä\d	²\t=M³D\´\Õ%Äy¤Ù&y´]ùSÇ.da{Ð4eýSÉ/äbD{ðDmSË0db{TuSÍ1äcÄ|0|4|8|<|@|D|H|Ldtüo3YÅ½¡ü¸üpKøpK+F(oâL>ÈAôÿ"/a#<Yú*@Rºd½ðq¨V/a|¹~ü2²ìù1²«NYàg¡G^bsæû'Ò³"ýò+ÎyÊîÎrÓåú/³ûÐlhO~J ±&IB>¥b{Pe'Ls¢ã½Ësãç òú~ÐZÂsêGR³B­rÂlú°¡åJ~£q$Ê-xÑdÝe\¯lÏ?U­p±.åÂ«M] ç¡EV"ã¿ÆVÃ¤ß9£àñ{ª®ÍjBsèö³2íÒA:Ìy­váÝ"®c4þÉl3*=}DJCá6FKPl|WIï}÷ÄßÊeÛÌð>el7	ïD_ÉiþSßè=}Z~þ:@Q¾lÝ0rzøJûÏp( nh®¥
Y výÕé}AvÔp#Ù¢áèü%îWzþÈ_·_Ç^¿VGÉ®û3ýÚO!Há'¿áHã	0Â×S8ÂkâNs»ðÂÙKûXb¬8íxÂ,AïhB¬½Ø¶{é5X­à¹=}e\© _f÷÷*}öªçi­õ¢ùÿÉiñæ
¯ >Ù*/ÿBÅNï"Iå1çÒâIç?ïbIf»n¨sª¥þ¤Ü²ÏÏð«JcvtZVýþi«Äà.»v'y>g»Õ!	Z}»ðNû¦'z@kÃåA¡º¯ß%8× Ý¾i}¥¹ã;ç"W¹_ê>ê)éÿ
XCµ«äWx¼Àx³õyWdnKp«nK°PJpÛåpëíP"?ôrãºTFÜã8 W´Ñ6(Yó÷ÒF1-äáºùY×÷ËÆ2-¸4ÞáÆq´OÆÄs%h=MÀd~úH-!ÓáÅGÙîwÁæM^BfJV
]]/sÇbBpÉáã$¤"£¡¡ÚÊY{gþ>Q	ë»P½7_TbJX¾tØy4½ßäx<çxÇMnQóJ øHH©Rþh¢+ CçtCÝEËÊ(V"é@µ;%,³,^b©:<ÝGín!'g]G]{Uãdö0ü6ìéÛùN:ð"ì(R2,%Z-a§rZJK>´åÒ?QÚOf/M©ç÷»À"0_^w¬_XÀ°°××ñüp^A±A¿$ïlûdãpË\ëPóP¦>f¡(N b{0DËo9Pì DÂ>#?,%)-*åÍ÷º<Ó9ºEÐEºEÎùiqú&É@Ð6À×º©×W.Õ©¯>9%6Ì£ö	ævMàLzÉêJ	¢!áábÂÁBA²±²21	HkÜãXÜ¸Í¾ôZ÷O[ÑßoK¿NÌ~§ÁÈ£õq3Ûèr^¾zÉñôD;äF®YåÈv}çì|D[Y¿®*ë>exÿ¨ÜÅ­ÿ3÷þj½¢w´Mz31Û41&j¨k|sß¡µoKÜ<EDÎ¢w¼h1ÊxÏ3RòVdo)"=M{\íDûtÎ¢Þy°`});

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
   "d": _emscripten_memcpy_big,
   "c": _emscripten_resize_heap
  };

  function initRuntime(asm) {
   asm["f"]();
  }

  var imports = {
   "a": asmLibraryArg
  };

  var _opus_frame_decoder_create, _malloc, _opus_frame_decode_float_deinterleaved, _opus_frame_decoder_destroy, _free;


  this.setModule = (data) => {
    WASMAudioDecoderCommon.setModule(EmscriptenWASM, data);
  };

  this.getModule = () =>
    WASMAudioDecoderCommon.getModule(EmscriptenWASM);

  this.instantiate = () => {
    this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then((instance) => {
      var asm = instance.exports;
   _opus_frame_decoder_create = asm["g"];
   _malloc = asm["h"];
   _opus_frame_decode_float_deinterleaved = asm["i"];
   _opus_frame_decoder_destroy = asm["j"];
   _free = asm["k"];
   asm["l"];
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
  return this;
  };}

  function OpusDecoder(options = {}) {
    // static properties
    if (!OpusDecoder.errors) {
      // prettier-ignore
      Object.defineProperties(OpusDecoder, {
        errors: {
          value: new Map([
            [-1, "OPUS_BAD_ARG: One or more invalid/out of range arguments"],
            [-2, "OPUS_BUFFER_TOO_SMALL: Not enough bytes allocated in the buffer"],
            [-3, "OPUS_INTERNAL_ERROR: An internal error was detected"],
            [-4, "OPUS_INVALID_PACKET: The compressed data passed is corrupted"],
            [-5, "OPUS_UNIMPLEMENTED: Invalid/unsupported request number"],
            [-6, "OPUS_INVALID_STATE: An encoder or decoder structure is invalid or already freed"],
            [-7, "OPUS_ALLOC_FAIL: Memory allocation has failed"],
          ]),
        },
      });
    }

    // injects dependencies when running as a web worker
    // async
    this._init = () =>
      new this._WASMAudioDecoderCommon(this).instantiate().then((common) => {
        this._common = common;

        const mapping = this._common.allocateTypedArray(
          this._channels,
          Uint8Array
        );

        mapping.buf.set(this._channelMappingTable);

        this._decoder = this._common.wasm._opus_frame_decoder_create(
          this._channels,
          this._streamCount,
          this._coupledStreamCount,
          mapping.ptr,
          this._preSkip,
          this._forceStereo
        );
      });

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
      this._common.wasm._opus_frame_decoder_destroy(this._decoder);

      this._common.free();
    };

    this._decode = (opusFrame) => {
      if (!(opusFrame instanceof Uint8Array))
        throw Error(
          "Data to decode must be Uint8Array. Instead got " + typeof opusFrame
        );

      this._input.buf.set(opusFrame);

      let samplesDecoded =
        this._common.wasm._opus_frame_decode_float_deinterleaved(
          this._decoder,
          this._input.ptr,
          opusFrame.length,
          this._output.ptr
        );

      let error;

      if (samplesDecoded < 0) {
        error =
          "libopus " +
          samplesDecoded +
          " " +
          (OpusDecoder.errors.get(samplesDecoded) || "Unknown Error");

        console.error(error);
        samplesDecoded = 0;
      }

      return {
        outputBuffer: this._common.getOutputChannels(
          this._output.buf,
          this._outputChannels,
          samplesDecoded
        ),
        samplesDecoded: samplesDecoded,
        error: error,
      };
    };

    this.decodeFrame = (opusFrame) => {
      let errors = [];

      const decoded = this._decode(opusFrame);

      if (decoded.error)
        this._common.addError(errors, decoded.error, opusFrame.length);

      this._frameNumber++;
      this._inputBytes += opusFrame.length;
      this._outputSamples += decoded.samplesDecoded;

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        errors,
        [decoded.outputBuffer],
        this._outputChannels,
        decoded.samplesDecoded,
        48000
      );
    };

    this.decodeFrames = (opusFrames) => {
      let outputBuffers = [],
        errors = [],
        samplesDecoded = 0,
        i = 0;

      while (i < opusFrames.length) {
        const opusFrame = opusFrames[i++];
        const decoded = this._decode(opusFrame);

        outputBuffers.push(decoded.outputBuffer);
        samplesDecoded += decoded.samplesDecoded;

        if (decoded.error)
          this._common.addError(errors, decoded.error, opusFrame.length);

        this._frameNumber++;
        this._inputBytes += opusFrame.length;
        this._outputSamples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        errors,
        outputBuffers,
        this._outputChannels,
        samplesDecoded,
        48000
      );
    };

    // injects dependencies when running as a web worker
    this._isWebWorker = OpusDecoder.isWebWorker;
    this._WASMAudioDecoderCommon =
      OpusDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = OpusDecoder.EmscriptenWASM || EmscriptenWASM;
    this._module = OpusDecoder.module;

    const MAX_FORCE_STEREO_CHANNELS = 8;
    const isNumber = (param) => typeof param === "number";

    const channels = options.channels;
    const streamCount = options.streamCount;
    const coupledStreamCount = options.coupledStreamCount;
    const channelMappingTable = options.channelMappingTable;
    const preSkip = options.preSkip;
    const forceStereo = options.forceStereo ? 1 : 0;

    // channel mapping family >= 1
    if (
      channels > 2 &&
      (!isNumber(streamCount) ||
        !isNumber(coupledStreamCount) ||
        !Array.isArray(channelMappingTable))
    ) {
      throw new Error("Invalid Opus Decoder Options for multichannel decoding.");
    }

    // channel mapping family 0
    this._channels = isNumber(channels) ? channels : 2;
    this._streamCount = isNumber(streamCount) ? streamCount : 1;
    this._coupledStreamCount = isNumber(coupledStreamCount)
      ? coupledStreamCount
      : this._channels - 1;
    this._channelMappingTable =
      channelMappingTable || (this._channels === 2 ? [0, 1] : [0]);
    this._preSkip = preSkip || 0;

    this._forceStereo =
      channels <= MAX_FORCE_STEREO_CHANNELS && channels != 2 ? forceStereo : 0;

    this._inputSize = 32000 * 0.12 * this._channels; // 256kbs per channel
    this._outputChannelSize = 120 * 48;
    this._outputChannels = this._forceStereo ? 2 : this._channels;

    this._ready = this._init();

    return this;
  }

  class OpusDecoderWebWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, "opus-decoder", OpusDecoder, EmscriptenWASM);
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

}));
