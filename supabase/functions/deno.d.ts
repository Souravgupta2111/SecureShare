// Deno runtime type declarations for Supabase Edge Functions

declare namespace Deno {
    export interface Env {
        get(key: string): string | undefined;
    }
    export const env: Env;
}

declare function serve(handler: (req: Request) => Promise<Response>): void;

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
    export function serve(handler: (req: Request) => Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
    export function createClient(url: string, key: string, options?: any): any;
}
