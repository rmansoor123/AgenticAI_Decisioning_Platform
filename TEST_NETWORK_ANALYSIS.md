# Testing Network Analysis - Account Linking Feature

## Quick Start

To see the account linking feature in action, you have two options:

### Option 1: Create Test Sellers with Connections (Recommended)

1. **Create test sellers with intentional connections:**
   ```bash
   curl -X POST http://localhost:3001/api/onboarding/test/connections
   ```

   This will create sellers with:
   - **Duplicate Email Group**: 3 sellers sharing the same email (`shared@example.com`)
   - **Same Phone Group**: 2 sellers sharing the same phone number
   - **Similar Address Group**: 2 sellers with similar addresses
   - **Same IP Group**: 3 sellers using the same IP address
   - **Bank Account Match**: 3 sellers with matching bank account numbers
   - **Multi-Connection Group**: 2 sellers connected by multiple attributes (email, phone, address, IP, bank, tax ID)

2. **Navigate to Network Analysis:**
   - Go to `/seller-network` in the app
   - Or: Sidebar → Seller Onboarding → Network Analysis

3. **View connections:**
   - You'll see a network graph with connected sellers
   - Click on any seller node to see their connections
   - Check the connection details panel to see which parameters match

### Option 2: Use Existing Sellers

If you already have sellers in the database:

1. **Find a seller ID:**
   - Go to `/onboarding` 
   - Look at the "Recent Onboardings" table
   - Note any seller ID

2. **Create a connected seller:**
   - Go to `/onboarding/form`
   - Fill in the form with **matching attributes** from an existing seller:
     - Use the **same email** as an existing seller
     - Or use the **same phone number**
     - Or use a **similar address**
     - Or use the **same IP address**
   - Submit the form

3. **View in Network Analysis:**
   - Go to `/seller-network`
   - The two sellers should now be connected
   - Click on either seller to see the connection

## Test Seller Groups Created

When you run the test endpoint, you'll get sellers with these connections:

### Group 1: Duplicate Email Group
- **3 sellers** all using `shared@example.com`
- **Connection type**: Email match
- **Seller IDs**: Will be `SLR-TEST-...` format

### Group 2: Same Phone Group  
- **2 sellers** using `+1-555-2000`
- **Connection type**: Phone match

### Group 3: Similar Address Group
- **2 sellers** with similar addresses in Toronto
- **Connection type**: Address match (fuzzy)

### Group 4: Same IP Group
- **3 sellers** using IP `185.220.101.1`
- **Connection type**: IP match

### Group 5: Bank Account Match
- **3 sellers** with matching bank account numbers
- **Connection type**: Bank account match (last 4 digits)

### Group 6: Multi-Connection Group (Most Interesting!)
- **2 sellers** connected by:
  - ✅ Same email: `connected@test.com`
  - ✅ Same phone: `+1-555-9999`
  - ✅ Similar address: `999 Tech Park, Austin, TX`
  - ✅ Same IP: `203.0.113.1`
  - ✅ Same bank account: `8888777766`
  - ✅ Same tax ID: `TAX-999`
- **This is the best example** - shows multiple connection types!

## Example Seller IDs to Try

After creating test sellers, look for seller IDs starting with:
- `SLR-TEST-` - These are the test sellers with connections

**Best seller to test with:**
- Any seller from "Multi-Connection Group" (Group 6)
- These will show the most connections

## How to Use the Network Analysis Page

1. **View all connections:**
   - The graph shows all sellers and their connections
   - Nodes = Sellers
   - Edges (lines) = Connections
   - Colors indicate risk status

2. **Filter connections:**
   - Check/uncheck connection types (email, phone, address, etc.)
   - Adjust "Min Connections" slider
   - Use search to find specific sellers

3. **Select a seller:**
   - Click any node in the graph
   - View all connected sellers in the details panel
   - See which parameters link them together

4. **Analyze patterns:**
   - Look for clusters (groups of connected sellers)
   - Identify potential duplicate accounts
   - Spot fraud networks

## Connection Types Detected

The system detects connections based on:

1. **Email** - Exact match
2. **Phone** - Exact match (normalized)
3. **Address** - Fuzzy match (70% similarity)
4. **Business Name** - Fuzzy match (80% similarity)
5. **Bank Account** - Last 4 digits match
6. **IP Address** - Exact match
7. **Tax ID** - Exact match

## Troubleshooting

**No connections showing?**
- Make sure you've created test sellers with the endpoint
- Check that connection type filters are enabled
- Try lowering the "Min Connections" to 1

**Graph not loading?**
- Make sure `react-force-graph-2d` is installed: `npm install react-force-graph-2d`
- Check browser console for errors

**Want to see more connections?**
- Create more test sellers: Run the test endpoint multiple times
- Or manually create sellers with matching attributes via the form

