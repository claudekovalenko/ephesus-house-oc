/* Where the shared board lives.
   These two values are public by design: the key is Supabase's publishable
   (anon) key, and row-level security on the server decides what it may do.
   It is not a secret and must not be treated as one. */
window.EPHESUS = {
  url: 'https://dmiysgmhwpkrunmswtrn.supabase.co',
  key: 'sb_publishable_9NfxdWLrFdExD-_6HwPs8A_uUtlTH3C',
  table: 'chores_docs',
  pollMs: 5000
};
