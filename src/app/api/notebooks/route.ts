import { listNotebooks, NotebookLMError } from '@/lib/notebooklm';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const notebooks = await listNotebooks();
    return Response.json({ notebooks });
  } catch (err) {
    if (err instanceof NotebookLMError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.code === 'auth_expired' ? 401 : 500 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'unknown', message }, { status: 500 });
  }
}
