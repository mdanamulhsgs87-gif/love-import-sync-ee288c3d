import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ethers } from "https://esm.sh/ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GD_IDENTITY_ADDRESS = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42";
const CELO_RPC = "https://forno.celo.org";
const GD_IDENTITY_ABI = [
  "function isWhitelisted(address account) view returns (bool)",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { privateKey } = await req.json();

    if (!privateKey) {
      return new Response(
        JSON.stringify({ isVerified: false, message: "Private key required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Derive address from private key
    let wallet: ethers.Wallet;
    try {
      wallet = new ethers.Wallet(privateKey);
    } catch {
      return new Response(
        JSON.stringify({ isVerified: false, message: "Invalid private key" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check on Celo blockchain
    const provider = new ethers.JsonRpcProvider(CELO_RPC);
    const contract = new ethers.Contract(GD_IDENTITY_ADDRESS, GD_IDENTITY_ABI, provider);
    const isWhitelisted = await contract.isWhitelisted(wallet.address);

    return new Response(
      JSON.stringify({
        isVerified: isWhitelisted,
        address: wallet.address,
        message: isWhitelisted
          ? "Address is verified on GoodDollar"
          : "Address is not yet verified",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Check verification error:", err);
    return new Response(
      JSON.stringify({ isVerified: false, message: "Verification check failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
