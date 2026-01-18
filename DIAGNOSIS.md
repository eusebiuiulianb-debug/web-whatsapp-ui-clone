DIAGNOSIS

1) Flujo A/B reproducible
- A (composer "Ofrecer extra (PPV)") crea Message + PpvMessage via `/api/chats/[chatId]/ppv`.
  Evidence: `src/pages/api/chats/[chatId]/ppv.ts` crea PpvMessage y devuelve `offerMeta` + `ppvMessageId`.
- B ("Adjuntar contenido" -> "Extras PPV") envia mensajes CONTENT (no PpvMessage, no offer card).
  Evidence: `src/components/ConversationDetails/index.tsx` -> content modal "extras" llama `handleAttachContent` y manda cada item como `type: "CONTENT"`.
  Este flujo no crea una tarjeta PPV; renderiza `ContentAttachmentCard`.

2) Field loss and where it happens
- El creator renderiza la tarjeta PPV cuando el mensaje trae `offerMeta.kind="ppv"` o `ppvMessageId`.
- En refresh, `/api/messages` devolvia el mensaje PPV sin esos campos (solo texto/originalText), asi que la UI lo trataba como texto normal.
- SSE `PPV_UNLOCKED` si incluia `offerMeta`, por eso en vivo a veces si aparecia.

3) Before/after object evidence (from API builders)
- /api/messages (creator refresh) for PPV:
  - BEFORE FIX (key fields):
    {
      id: "<msg-id>",
      text: "<placeholder>",
      originalText: "<placeholder>",
      offerMeta: undefined,
      ppvMessageId: undefined
    }
  - AFTER FIX (key fields):
    {
      id: "<msg-id>",
      text: "<placeholder>\\n\\n__NOVSY_OFFER__:{...\"kind\":\"ppv\",\"status\":\"locked\"}",
      originalText: "<placeholder>\\n\\n__NOVSY_OFFER__:{...\"kind\":\"ppv\",\"status\":\"locked\"}",
      offerMeta: { kind: "ppv", ... },
      ppvMessageId: "<ppv-id>"
    }
- PPV_UNLOCKED SSE payload (creator realtime):
  - Built in `src/pages/api/ppv/[id]/purchase.ts` via `buildPpvMessagePayload`.
  - Always includes `offerMeta` + `ppvMessageId`, so the card stays visible in live updates.

4) Short diagnosis (field lost + where)
- Field lost: `offerMeta` (kind="ppv") / `ppvMessageId`.
- Where: `/api/messages` response mapping for PPV messages did not attach the PPV metadata, so refresh lost the PPV shape.

5) Fix applied (minimal, backend-driven)
- `/api/messages` always joins `ppvMessage` and maps it to `offerMeta` + `ppvMessageId`.
- Message text is always a placeholder; real PPV content stays in PpvMessage and is only returned by `/api/ppv/[id]` when allowed.
- Creator UI now trusts `offerMeta` / `ppvMessageId` (not text markers) to render the PPV card; markers remain as a fallback for legacy payloads.
