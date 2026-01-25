# ID Verification Data Flow: How Data is Read from ID Card to Seller Profile

## Overview
This document explains how the system reads information from your ID card and populates the seller profile.

## Data Flow Process

### Step 1: Image Capture
- User captures/uploads selfie and ID document images
- Images are stored as base64 strings in the frontend state
- Images are displayed with "Captured" badges

### Step 2: ID Scanning & OCR Extraction
When you click "Scan & Verify ID", the system:

1. **Sends images to backend** (`POST /api/onboarding/id-verification`)
   - Selfie image (base64)
   - ID document image (base64)
   - Temporary seller ID

2. **OCR Processing** (`extractIdInformation()`)
   - Simulates OCR extraction from ID image
   - Extracts text fields from the document
   - **Currently Simulated** - In production would use:
     - AWS Textract
     - Google Cloud Vision API
     - Microsoft Azure Form Recognizer
     - Onfido, Jumio, Veriff APIs

3. **Extracted Data Fields:**
   ```javascript
   {
     documentType: 'DRIVER_LICENSE', // or PASSPORT, NATIONAL_ID
     documentNumber: 'DL12345678',
     firstName: 'John',
     lastName: 'Doe',
     dateOfBirth: '1990-01-15',
     expiryDate: '2029-01-15',
     issueDate: '2022-01-15',
     address: '123 Main Street, New York, NY 10001',
     country: 'US',
     state: 'NY',
     zipCode: '10001'
   }
   ```

### Step 3: Face Matching
- Compares selfie photo with ID document photo
- Calculates similarity score
- Performs liveness check
- **Currently Simulated** - In production would use:
   - AWS Rekognition
   - Azure Face API
   - Google Cloud Vision API

### Step 4: Document Validation
- Checks if ID is expired
- Validates issue date
- Verifies age (must be 18+)
- Checks OCR confidence
- Validates document number format

### Step 5: Auto-Fill Form Fields
The extracted data automatically populates these form fields:

- ✅ **Address** - From ID address field
- ✅ **Country** - From ID country field
- ✅ **Document Type** - Mapped from extracted type
- ✅ **Document Number** - From ID document number

### Step 6: Data Storage
1. **Images saved to database:**
   - Table: `seller_images`
   - Stores: selfie image, ID image (base64)
   - Links to seller via `seller_id`

2. **Verification results saved:**
   - Extracted data
   - Face match results
   - Validation results
   - Confidence scores

### Step 7: Seller Profile Creation
When you submit the form:

1. **Seller data includes:**
   - All form fields (including auto-filled ones)
   - ID verification results
   - Extracted data from ID
   - Face match confirmation
   - Validation status

2. **Agent evaluation uses:**
   - ID verification results (pass/fail)
   - Face match results
   - Document validation
   - Extracted information for risk assessment

3. **Final seller record contains:**
   - Business information
   - Contact information (with auto-filled address/country)
   - Identity information (with auto-filled document details)
   - ID verification metadata
   - Risk assessment

## Current Implementation Status

### ✅ Working Features:
- Image capture (camera + file upload)
- Image storage in database
- OCR simulation (extracts structured data)
- Face matching simulation
- Document validation
- Auto-fill form fields
- Integration with onboarding agent

### 🔄 Simulated (Ready for Real Integration):
- **OCR Extraction** - Currently returns mock data
- **Face Matching** - Currently simulated with random scores
- **Liveness Detection** - Currently simulated

### 🔧 To Enable Real OCR:
Replace `extractIdInformation()` in `id-verification.js` with:
- AWS Textract API calls
- Google Cloud Vision API calls
- Azure Form Recognizer API calls
- Third-party services (Onfido, Jumio, Veriff)

### 🔧 To Enable Real Face Matching:
Replace `matchFaceToId()` in `id-verification.js` with:
- AWS Rekognition API calls
- Azure Face API calls
- Google Cloud Vision API calls

## Troubleshooting

### Issue: 404 Error on `/api/onboarding/id-verification`

**Solution:** Restart the backend server
```bash
cd backend
npm run dev
# or
npm start
```

The endpoint exists in the code but the server needs to be restarted to register it.

### Issue: Images not auto-filling form

**Check:**
1. Browser console for errors
2. Network tab to see if API call succeeded
3. Verify extracted data is in the response
4. Check if form fields are being updated in React state

## API Endpoints

### POST `/api/onboarding/id-verification`
**Request:**
```json
{
  "selfieImage": "data:image/jpeg;base64,...",
  "idImage": "data:image/jpeg;base64,...",
  "sellerId": "TEMP-ABC123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "confidence": 0.85,
    "extractedData": {
      "firstName": "John",
      "lastName": "Doe",
      "address": "123 Main St...",
      "country": "US",
      "documentNumber": "DL123456",
      "documentType": "DRIVER_LICENSE"
    },
    "faceMatch": { ... },
    "validation": { ... }
  },
  "workflowId": "ID-VERIFY-ABC123",
  "steps": [ ... ],
  "savedImageIds": {
    "selfie": "IMG-ABC123",
    "idDocument": "IMG-DEF456"
  }
}
```

## Database Schema

### `seller_images` Table
- `image_id` (Primary Key)
- `seller_id` (Foreign Key to sellers)
- `image_type` (SELFIE or ID_DOCUMENT)
- `image_data` (Base64 encoded image)
- `metadata` (JSON with verification results)
- `created_at` (Timestamp)

### Seller Record Includes
- `idVerification` object with:
  - `isValid` (boolean)
  - `confidence` (0-1)
  - `extractedData` (all OCR fields)
  - `faceMatch` (match results)
  - `validation` (document validation)
  - `savedImageIds` (references to images)

## Next Steps

1. **Restart backend server** to register the endpoint
2. **Test the flow:**
   - Capture images
   - Click "Scan & Verify ID"
   - Check form fields are auto-filled
   - Submit form
3. **Verify data in database:**
   - Check `seller_images` table
   - Check seller record has `idVerification` data

