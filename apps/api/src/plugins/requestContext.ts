import fp from "fastify-plugin";

export default fp(async (fastify) => {
  fastify.addHook("onRequest", async (request) => {
    request.log = request.log.child({ requestId: request.id });
  });
});
