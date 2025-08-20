import { Client, Environment } from "/square";
import { nanoid } from "nanoid";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    return res.status(200).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // CORS: allow only your domains (adjust as needed)
    const origin = req.headers.origin || "";
    const allowed = [
      "https://supersmashburgers.ca",
      "https://smashedha.ca",
      "https://try.smashedha.ca",
      "http://localhost:3000"
    ];
    if (origin && !allowed.some(d => origin.startsWith(d))) {
      return res.status(403).json({ error: "Forbidden origin" });
    }
    res.setHeader("Access-Control-Allow-Origin", origin || allowed[0]);
    res.setHeader("Vary", "Origin");

    const { first_name, email, consent } = req.body || {};
    if (!email || !consent) return res.status(400).json({ error: "Email and consent are required." });

    const client = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,   // set on Vercel
      environment: Environment.Production
    });

    // 1) Find by email (case-insensitive)
    const search = await client.customersApi.searchCustomers({
      query: { filter: { emailAddress: { exact: email.toLowerCase() } } }
    });

    let customerId;
    if (search.result?.customers?.length) {
      // 2a) Update existing record
      customerId = search.result.customers[0].id;
      await client.customersApi.updateCustomer(customerId, {
        givenName: first_name || undefined,
        emailAddress: email,
        note: "Marketing: consent=true (source: website)"
      });
    } else {
      // 2b) Create a new customer
      const created = await client.customersApi.createCustomer({
        idempotencyKey: nanoid(),
        givenName: first_name || undefined,
        emailAddress: email,
        referenceId: "newsletter",
        note: "Marketing: consent=true (source: website)"
      });
      customerId = created.result.customer.id;
    }

    // 3) Optional: set a custom attribute (records consent)
    try {
      await client.customerCustomAttributesApi.upsertCustomerCustomAttribute(customerId, {
        customAttribute: { key: "newsletter_opt_in", value: "true", visibility: "VISIBILITY_READ_WRITE_VALUES" }
      });
    } catch {}

    // 4) Optional: add to a group if you created one
    if (process.env.SQUARE_NEWSLETTER_GROUP_ID) {
      try {
        await client.customerGroupsApi.addGroupToCustomer(customerId, {
          groupId: process.env.SQUARE_NEWSLETTER_GROUP_ID
        });
      } catch {}
    }

    return res.status(200).json({ ok: true, customerId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "Square error" });
  }
}
  
