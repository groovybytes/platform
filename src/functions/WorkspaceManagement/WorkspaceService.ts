import { app, HttpRequest, type HttpResponseInit, InvocationContext } from "@azure/functions";

export async function WorkspaceService(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    const name = request.query.get('name') || await request.text() || 'world';

    return { body: `Hello, ${name}!` };
};

app.http('WorkspaceService', {
    route: "workspace",
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: WorkspaceService
});
