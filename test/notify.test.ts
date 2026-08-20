import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkMessage, DISCORD_MAX_LENGTH, TELEGRAM_MAX_LENGTH } from "../src/notify";

describe("chunkMessage", () => {
  it("returns the original message when it fits", () => {
    assert.deepEqual(chunkMessage("hello", 20), ["hello"]);
  });

  it("splits on blank lines to stay under the limit", () => {
    const message = ["block-one", "block-two", "block-three"].join("\n\n");
    const chunks = chunkMessage(message, 12);
    assert.ok(chunks.length >= 2);
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 12);
    }
    assert.equal(chunks.join("\n\n").replace(/\n\n/g, ""), message.replace(/\n\n/g, ""));
  });

  it("hard-splits a single oversized block", () => {
    const chunks = chunkMessage("abcdefghij", 4);
    assert.deepEqual(chunks, ["abcd", "efgh", "ij"]);
  });

  it("uses limits below Telegram and Discord caps", () => {
    assert.ok(TELEGRAM_MAX_LENGTH < 4096);
    assert.ok(DISCORD_MAX_LENGTH < 2000);
  });
});
