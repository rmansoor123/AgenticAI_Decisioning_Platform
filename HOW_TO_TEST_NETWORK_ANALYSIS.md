# How to Test Network Analysis - Account Linking

## Quick Answer: What Seller ID to Use?

**You need to create sellers with connections first!** Here's how:

## Method 1: Create Test Sellers with Connections (Easiest)

### Step 1: Create Test Data
Run this command in your terminal (or use Postman/curl):

```bash
curl -X POST http://localhost:3001/api/onboarding/test/connections
```

This creates **15 test sellers** organized into 6 groups with intentional connections.

### Step 2: Find Seller IDs
After running the command, you'll get a response with seller IDs. Look for sellers with:
- **Email**: `shared@example.com` (3 sellers connected)
- **Email**: `connected@test.com` (2 sellers with multiple connections - BEST TO TEST!)

### Step 3: View in Network Analysis
1. Go to `/seller-network` in the app
2. You'll see a network graph with connected sellers
3. Click on any seller node to see their connections
4. **Best test**: Click on a seller with email `connected@test.com` - they have 6 connection types!

## Method 2: Create Sellers Manually with Matching Attributes

### Step 1: Create First Seller
1. Go to `/onboarding/form`
2. Fill in:
   - Business Name: `Test Seller A`
   - Email: `test@example.com`
   - Phone: `+1-555-1234`
   - Country: `US`
   - Address: `123 Main St, New York, NY`
   - IP Address: `192.168.1.100`
   - Account Number: `1234567890`
3. Submit and note the Seller ID (e.g., `SLR-ABC123`)

### Step 2: Create Connected Seller
1. Go to `/onboarding/form` again
2. Fill in with **matching attributes**:
   - Business Name: `Test Seller B` (different)
   - Email: `test@example.com` ✅ **SAME EMAIL**
   - Phone: `+1-555-1234` ✅ **SAME PHONE**
   - Country: `US`
   - Address: `123 Main Street, New York, NY` ✅ **SIMILAR ADDRESS**
   - IP Address: `192.168.1.100` ✅ **SAME IP**
   - Account Number: `1234567890` ✅ **SAME BANK ACCOUNT**
3. Submit

### Step 3: View Connections
1. Go to `/seller-network`
2. You should see both sellers connected
3. Click on either seller to see connection details

## Example Seller IDs After Creating Test Data

After running the test endpoint, you'll get seller IDs like:
- `SLR-TEST-XXXX-YYYY` format

**Best sellers to test with:**
- Any seller with email `connected@test.com` (has 6 connection types!)
- Any seller with email `shared@example.com` (has 2 other connections)

## What You'll See

### Connection Types Detected:
1. **Email Match** - Same email address
2. **Phone Match** - Same phone number  
3. **Address Match** - Similar addresses (fuzzy matching)
4. **Business Name Match** - Similar business names
5. **Bank Account Match** - Same last 4 digits
6. **IP Match** - Same IP address
7. **Tax ID Match** - Same tax ID

### Visual Features:
- **Nodes** = Sellers (colored by risk status)
- **Edges** = Connections (colored by connection type)
- **Edge width** = Number of connections between sellers
- **Node size** = Risk score

## Quick Test Commands

```bash
# Create test sellers with connections
curl -X POST http://localhost:3001/api/onboarding/test/connections

# List all sellers to find IDs
curl http://localhost:3001/api/onboarding/sellers?limit=20

# Get specific seller details
curl http://localhost:3001/api/onboarding/sellers/SLR-TEST-XXXX-YYYY
```

## Troubleshooting

**No connections showing?**
- Make sure you've created sellers with matching attributes
- Check that connection type filters are enabled (all should be checked by default)
- Lower "Min Connections" to 1

**Graph not loading?**
- Make sure `react-force-graph-2d` is installed
- Check browser console for errors
- Refresh the page

**Want to see more connections?**
- Run the test endpoint multiple times
- Or create more sellers manually with matching attributes

