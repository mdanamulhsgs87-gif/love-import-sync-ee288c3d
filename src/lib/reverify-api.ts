import { supabase } from "@/integrations/supabase/client";
import { ethers } from "ethers";
import { compressToEncodedURIComponent } from "lz-string";

const FV_LOGIN_MSG = `Sign this message to login into GoodDollar Unique Identity service.
WARNING: do not sign this message unless you trust the website/application requesting this signature.
nonce:`;

const FV_IDENTIFIER_MSG2 = `Sign this message to request verifying your account <account> and to create your own secret unique identifier for your anonymized record.
You can use this identifier in the future to delete this anonymized record.
WARNING: do not sign this message unless you trust the website/application requesting this signature.`;

const IDENTITY_URL = "https://goodid.gooddollar.org";

// Types (without private_key for client-side use)
export type FaceWalletBinding = {
  id: string;
  wallet_address: string;
  private_key: string;
  face_photo_url: string;
  user_id: number;
  created_at: string;
};

export type ReverifyQueueItem = {
  id: string;
  wallet_address: string;
  private_key: string;
  face_photo_url: string;
  assigned_user_id: number;
  binding_id: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
};

// Admin vault helper
const VAULT_PASSWORD = "Anamul*984516";
async function vaultCall(action: string, data?: any) {
  const { data: result, error } = await supabase.functions.invoke("admin-vault", {
    body: { password: VAULT_PASSWORD, action, data },
  });
  if (error) throw error;
  if (result?.error) throw new Error(result.error);
  return result;
}

// Admin: Get all face-wallet bindings (via edge function)
export async function getAllFaceWalletBindings(): Promise<FaceWalletBinding[]> {
  const result = await vaultCall("get_bindings");
  return result.bindings || [];
}

// Admin: Add wallet to re-verify queue (via edge function)
export async function addToReverifyQueue(binding: FaceWalletBinding) {
  await vaultCall("add_to_queue", { binding });
}

// Admin: Bulk add all bindings to re-verify queue (via edge function)
export async function addAllToReverifyQueue(bindings: FaceWalletBinding[]): Promise<number> {
  const result = await vaultCall("add_all_to_queue", { bindings });
  return result.added || 0;
}

// Admin: Get all re-verify queue items (via edge function)
export async function getReverifyQueue(): Promise<ReverifyQueueItem[]> {
  const result = await vaultCall("get_reverify_queue");
  return result.queue || [];
}

// Admin: Delete re-verify queue item (via edge function)
export async function deleteReverifyQueueItem(id: string) {
  await vaultCall("delete_queue_item", { id });
}

// Admin: Clear completed re-verify queue items (via edge function)
export async function clearCompletedReverifyQueue() {
  await vaultCall("clear_completed");
}

// Generate fresh verify URL from saved private key (still used by KeySubmitter for 1st verify)
export async function generateVerifyUrlAsync(
  privateKey: string,
  displayName?: string
): Promise<{ address: string; verifyUrl: string }> {
  const wallet = new ethers.Wallet(privateKey);
  const address = wallet.address;
  const nonce = (Date.now() / 1000).toFixed(0);

  const loginSig = await wallet.signMessage(FV_LOGIN_MSG + nonce);
  const fvSig = await wallet.signMessage(
    FV_IDENTIFIER_MSG2.replace("<account>", address)
  );

  const params = {
    account: address,
    nonce,
    fvsig: fvSig,
    firstname: displayName || "User",
    sg: loginSig,
    chain: 42220,
  };

  const url = new URL(IDENTITY_URL);
  url.searchParams.append(
    "lz",
    compressToEncodedURIComponent(JSON.stringify(params))
  );

  return { address, verifyUrl: url.toString() };
}

// Complete re-verify task
export async function completeReverifyTask(taskId: string, userId: number) {
  const { error } = await supabase
    .from("reverify_queue")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("assigned_user_id", userId);
  if (error) throw error;

  const { data: userData } = await supabase
    .from("users")
    .select("reverify_count")
    .eq("id", userId)
    .single();

  const currentCount = (userData as any)?.reverify_count || 0;
  await supabase
    .from("users")
    .update({ reverify_count: currentCount + 1 })
    .eq("id", userId);
}
