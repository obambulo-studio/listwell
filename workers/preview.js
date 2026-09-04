export default {
  async fetch() {
    return new Response("Listwell", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
