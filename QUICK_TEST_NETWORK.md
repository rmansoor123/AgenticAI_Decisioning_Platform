# Quick Test - Network Analysis Search

## Seller IDs Created (Ready to Test)

I've created sellers with connections. Here are the seller IDs you can search for:

### ✅ Best Test Cases (Multiple Connections):

1. **SLR-CONN-ALPHA**
   - Connected to: SLR-CONN-BETA
   - Connection types: Email, Phone, Address, IP, Bank Account, Tax ID (6 types!)
   - Email: `connected@test.com`

2. **SLR-CONN-BETA**
   - Connected to: SLR-CONN-ALPHA
   - Same connections as above

### ✅ Email Connection:

3. **SLR-EMAIL-1**
   - Connected to: SLR-EMAIL-2
   - Connection: Same email (`shared@example.com`)

4. **SLR-EMAIL-2**
   - Connected to: SLR-EMAIL-1
   - Connection: Same email

### ✅ IP Connection:

5. **SLR-IP-1**
   - Connected to: SLR-IP-2
   - Connection: Same IP (`185.220.101.1`)

6. **SLR-IP-2**
   - Connected to: SLR-IP-1
   - Connection: Same IP

### ✅ Phone Connection:

7. **SLR-PHONE-1**
   - Connected to: SLR-PHONE-2
   - Connection: Same phone (`+1-555-3000`)

8. **SLR-PHONE-2**
   - Connected to: SLR-PHONE-1
   - Connection: Same phone

### ✅ Bank Account Connection:

9. **SLR-BANK-1**
   - Connected to: SLR-BANK-2
   - Connection: Same bank account (last 4: `8877`)

10. **SLR-BANK-2**
    - Connected to: SLR-BANK-1
    - Connection: Same bank account

## How to Test Search

1. **Go to** `/seller-network`
2. **In the search box**, type: `SLR-CONN-ALPHA`
3. **You should see:**
   - Graph updates to show SLR-CONN-ALPHA and SLR-CONN-BETA
   - Seller automatically selected
   - Connection details panel shows all 6 connection types

## If Search Doesn't Work

**Try these steps:**

1. **Refresh the page** - Make sure sellers are loaded
2. **Check connection type filters** - Make sure all are checked (email, phone, address, etc.)
3. **Lower "Min Connections"** to 1
4. **Try searching for email**: `connected@test.com` (should find both ALPHA and BETA)
5. **Check browser console** for any errors

## Expected Behavior

When you search for `SLR-CONN-ALPHA`:
- ✅ Graph should show 2 nodes (ALPHA and BETA)
- ✅ 1 connection line between them
- ✅ Seller should be auto-selected
- ✅ Connection details should show 6 connection types
- ✅ Search box should show "Found 2 seller(s)"

## Troubleshooting

**If nothing shows:**
- Make sure both sellers exist (they do - I verified)
- Check that connection type filters include the matching types
- Try clicking "Refresh" button
- Check browser console for JavaScript errors

**If graph is empty:**
- The sellers might not have connections detected yet
- Try creating them again or wait a moment for the graph to build

