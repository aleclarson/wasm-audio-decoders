import waveHeader from "@wpdas/wave-header";
import fs from "fs/promises";
import { performance } from "perf_hooks";

const max = (a, b) => (a > b ? a : b);
const min = (a, b) => (a < b ? a : b);
const floatToInt = (val) =>
  val > 0 ? min(val * 32767, 32767) : max(val * 32767, -32768);

const getInterleavedInt16Array = (channelData, samples) => {
  const channels = channelData.length;
  const interleaved = new Int16Array(samples * channels);

  for (let offset = 0; offset - channels < samples; offset++) {
    interleaved[offset * channels] = floatToInt(channelData[0][offset]);
    interleaved[offset * channels + 1] = floatToInt(channelData[1][offset]);
  }

  return interleaved;
};

const getWaveFileHeader = ({ bitDepth, sampleRate, length, channels }) =>
  waveHeader.generateHeader(Int16Array.BYTES_PER_ELEMENT * length, {
    channels,
    bitDepth,
    sampleRate,
  });

export const testDecoder = async (decoder, fileName, inputPath, outputPath) => {
  const input = await fs.open(inputPath, "r+");
  const output = await fs.open(outputPath, "w+");

  let decodeStart, decodeEnd, inStart, inEnd, outStart, outEnd;

  let bytesWritten = 44,
    totalBytesRead = 0,
    sampleRate,
    totalSamplesDecoded = 0;

  // allocate space for the wave header
  await output.writeFile(Buffer.alloc(44));

  // print the initial stats header
  process.stderr.write("\n" + decoder.constructor.name + " " + fileName + "\n");

  while (true) {
    inStart = performance.now();
    const { bytesRead, buffer } = await input.read(
      Buffer.allocUnsafe(2 ** 24),
      0,
      2 ** 24
    );
    inEnd = performance.now();

    if (bytesRead === 0) break;

    decodeStart = performance.now();
    const {
      channelData,
      samplesDecoded,
      sampleRate: rate,
    } = await decoder.decode(buffer.subarray(0, bytesRead));
    decodeEnd = performance.now();

    const interleaved = getInterleavedInt16Array(channelData, samplesDecoded);

    outStart = performance.now();
    await output.writeFile(interleaved);
    outEnd = performance.now();

    sampleRate = rate;
    bytesWritten += interleaved.length;
    totalSamplesDecoded += samplesDecoded;
    totalBytesRead += bytesRead;

    const decodeTime = (decodeEnd - decodeStart) / 1000;
    const inTime = (inEnd - inStart) / 1000;
    const outTime = (outEnd - outStart) / 1000;
    const actualBytesWritten = bytesWritten * 2;

    process.stderr.write(
      "rate: " +
        (samplesDecoded / sampleRate / decodeTime).toFixed(0) +
        "x" +
        "\tmins: " +
        (totalSamplesDecoded / sampleRate / 60).toFixed(2) +
        "\tin: " +
        (totalBytesRead / 1024 ** 2).toFixed(2) +
        " MiB (" +
        (bytesRead / decodeTime / 1024 ** 2).toFixed(2) +
        " MiB/s)" +
        "\tout: " +
        (actualBytesWritten / 1024 ** 2).toFixed(2) +
        " MiB (" +
        ((interleaved.length * 2) / decodeTime / 1024 ** 2).toFixed(2) +
        "MiB/s)" +
        "\n"
    );
  }

  const header = getWaveFileHeader({
    bitDepth: 16,
    sampleRate,
    samplesDecoded: totalSamplesDecoded,
    length: bytesWritten - 44,
    channels: 2,
  });

  await output.write(header, 0, header.length, 0);

  await input.close();
  await output.close();

  return {
    samplesDecoded: totalSamplesDecoded,
    sampleRate,
  };
};
