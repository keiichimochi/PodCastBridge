require("dotenv").config({ path: ".env.test" });
const fetch = require("node-fetch");

      async function main() {
        const endpoint = "https://api.podchaser.com/graphql";
        const key = process.env.PODCHASER_API_KEY;
        const secret = process.env.PODCHASER_API_SECRET;

        if (!key || !secret) {
          throw new Error("Missing env vars");
        }

        const tokenRes = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              mutation RequestAccessToken($client_id: String!,
    $client_secret: String!) {
                requestAccessToken(input: {
                  grant_type: CLIENT_CREDENTIALS
                  client_id: $client_id
                  client_secret: $client_secret
                }) {
                  access_token
                }
              }
            `,
            variables: { client_id: key, client_secret: secret
    }
          })
        });
        const tokenJson = await tokenRes.json();
        const token =
   tokenJson.data?.requestAccessToken?.access_token;
        if (!token) {
          console.error("Token response:", tokenJson);
          throw new Error("Token fetch failed");
        }
        console.log("Token OK");

        const queryRes = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            query: `
              query {
                podcast(identifier: { id: "731600", type: PODCHASER }) {
                  title
                }
              }
            `
          })
        });
        const queryJson = await queryRes.json();
        console.log("Query response:",
   JSON.stringify(queryJson, null, 2));
      }

      main().catch((err) => {
        console.error(err);
        process.exit(1);
      });