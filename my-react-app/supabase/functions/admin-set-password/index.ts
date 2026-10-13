import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const appOrigin = Deno.env.get("APP_ORIGIN");
const corsHeaders = {
  "Access-Control-Allow-Origin": appOrigin ?? "null",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function jsonResponse(status: number, body: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }
  if (!appOrigin || request.headers.get("origin") !== appOrigin) {
    return jsonResponse(403, { error: "Origin not allowed." });
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse(401, { error: "Authentication required." });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid request body." });
  }
  if (
    typeof input !== "object" || input === null ||
    !("target_user_id" in input) || !("new_password" in input) ||
    typeof input.target_user_id !== "string" || typeof input.new_password !== "string"
  ) {
    return jsonResponse(400, { error: "A target account and new password are required." });
  }
  if (input.new_password.length < 12 || input.new_password.length > 128) {
    return jsonResponse(400, { error: "Password must be between 12 and 128 characters." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Password administration is not configured." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse(401, { error: "Your session is invalid or expired." });
  }

  const { data: caller, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Admin password authorization lookup failed:", profileError.message);
    return jsonResponse(500, { error: "Could not verify administrator permissions." });
  }
  if (caller?.role !== "admin") {
    return jsonResponse(403, { error: "Administrator access required." });
  }
  if (input.target_user_id === authData.user.id) {
    return jsonResponse(400, { error: "Use your own account settings to change your password." });
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    input.target_user_id,
    { password: input.new_password },
  );
  if (updateError) {
    console.error("Admin password update failed:", updateError.message);
    return jsonResponse(400, { error: "Could not update that account's password." });
  }

  const { error: auditError } = await adminClient.from("admin_audit_log").insert({
    actor_id: authData.user.id,
    target_user_id: input.target_user_id,
    action: "user_password_reset",
  });
  if (auditError) {
    console.error("Password reset audit write failed:", auditError.message);
    return jsonResponse(500, { error: "Password changed, but the audit entry failed. Contact support." });
  }

  return jsonResponse(200, { message: "User password updated." });
});
