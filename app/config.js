/* Where the shared board lives.
   Both values are public by design: this is Supabase's anon key, and row-level
   security on the server decides what it may do. It is not a secret.
   It must be the JWT-form anon key, not an `sb_publishable_...` key: PostgREST
   reads the Authorization header as a JWT and rejects anything else with a 401. */
window.EPHESUS = {
  url: 'https://dmiysgmhwpkrunmswtrn.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtaXlzZ21od3BrcnVubXN3dHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMzMyODAsImV4cCI6MjEwMzYwOTI4MH0.D7WXim36S9J249irzA6MSjf2smfjc2Fw4pm0fx06MqI',
  table: 'chores_docs',
  pollMs: 5000
};
