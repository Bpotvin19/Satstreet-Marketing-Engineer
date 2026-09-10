/* Assign a prospect to a person. The only endpoint on this site that writes.

   Deliberately narrow: it sets one text property, on one database, to one of
   a fixed set of names. It will not create, delete or archive anything, and
   it does not touch status, notes or any other field the bots maintain.

   Assignment records who intends to reach out. It is not contact, not
   qualification, and it does not change the record's research status.
*/

import { json, notion, refuse } from './_notion.js'

const PROSPECT_DB = process.env.NOTION_PROSPECTS_DB?.trim() || '8524a342-e17f-4a67-a414-339e005a3592'
const PROSPECT_SOURCE = process.env.NOTION_PROSPECTS_SOURCE?.trim() || '0db193a3-b5e5-4679-8de1-42a2f96c185c'

/* Free text would let one careless call scribble anything into a field the
   whole desk reads. Empty string clears an assignment. */
const OWNERS = new Set(['Ben', 'George', 'Dan', 'Mike', ''])

const bare = (value: string): string => String(value ?? '').replace(/-/g, '').toLowerCase()

export default async function handler(request: Request): Promise<Response> {
  const denied = refuse(request, 'POST')
  if (denied) return denied

  let payload: any
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const id = String(payload?.id ?? '').trim()
  const owner = String(payload?.owner ?? '').trim()

  if (!/^[0-9a-f-]{32,36}$/i.test(id)) return json({ error: 'A prospect id is required.' }, 400)
  if (!OWNERS.has(owner)) return json({ error: 'Unknown owner.' }, 400)

  try {
    /* Never patch an id straight from the browser. Read it first and confirm
       it really is a row of the prospect database. */
    const page = await notion(`/pages/${id}`)
    const parent = page?.parent ?? {}
    const belongs =
      bare(parent.database_id ?? '') === bare(PROSPECT_DB) ||
      bare(parent.data_source_id ?? '') === bare(PROSPECT_SOURCE)
    if (!belongs) return json({ error: 'That record is not a prospect.' }, 403)
    if (page?.archived) return json({ error: 'That record is archived.' }, 409)

    const updated = await notion(`/pages/${id}`, {
      properties: {
        Owner: { rich_text: owner ? [{ type: 'text', text: { content: owner } }] : [] },
      },
    })

    return json({ id, owner, lastEdited: updated?.last_edited_time ?? '' }, 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The assignment could not be saved.'
    /* A read-only integration is the likely cause, and it is worth saying so
       rather than leaving someone clicking a control that never sticks. */
    const readOnly = /insufficient permission|unauthorized|restricted/i.test(message)
    return json(
      { error: readOnly ? 'The Notion integration cannot edit this database. Grant it edit access to save assignments.' : message },
      readOnly ? 403 : 502,
    )
  }
}

export const config = { path: '/api/prospect-owner' }
