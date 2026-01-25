# Real OCR Integration Guide

## Current Status: Simulated/Mock Data

The ID verification system is currently using **simulated OCR extraction**. This means it returns hardcoded mock data instead of actually reading from your ID image.

### Current Mock Data Location

The mock data is generated in:
- **File**: `backend/services/business/seller-onboarding/id-verification.js`
- **Function**: `extractIdInformation()`
- **Lines**: 11-52

### Current Mock Output:
```javascript
{
  documentType: 'DRIVER_LICENSE',
  documentNumber: 'DLEKTFJK92',  // Randomly generated
  firstName: 'John',              // Hardcoded
  lastName: 'Doe',                // Hardcoded
  dateOfBirth: '1990-01-15',      // Hardcoded
  address: '123 Main Street, New York, NY 10001',  // Hardcoded
  country: 'US',                  // Hardcoded
  state: 'NY',                    // Hardcoded
  zipCode: '10001'                // Hardcoded
}
```

## How to Enable Real OCR

### Option 1: AWS Textract (Recommended)

1. **Install AWS SDK:**
```bash
cd backend
npm install @aws-sdk/client-textract
```

2. **Update `extractIdInformation()` function:**

```javascript
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';

async function extractIdInformation(idImageData) {
  try {
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(idImageData.split(',')[1], 'base64');
    
    const client = new TextractClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    
    const command = new DetectDocumentTextCommand({
      Document: { Bytes: imageBuffer }
    });
    
    const response = await client.send(command);
    
    // Parse Textract response
    const extractedData = parseTextractResponse(response);
    
    return {
      success: true,
      data: extractedData,
      ocrMetadata: {
        processingTime: response.ProcessingTime,
        imageQuality: 'HIGH',
        ocrEngine: 'AWS_TEXTRACT',
        language: response.DetectDocumentTextModelVersion
      }
    };
  } catch (error) {
    console.error('AWS Textract error:', error);
    throw error;
  }
}

function parseTextractResponse(response) {
  // Parse Textract blocks to extract structured data
  const blocks = response.Blocks || [];
  const text = blocks.filter(b => b.BlockType === 'LINE').map(b => b.Text).join(' ');
  
  // Use regex or ML to extract fields
  // This is a simplified example - you'd want more sophisticated parsing
  return {
    documentType: detectDocumentType(text),
    documentNumber: extractDocumentNumber(text),
    firstName: extractFirstName(text),
    lastName: extractLastName(text),
    dateOfBirth: extractDateOfBirth(text),
    address: extractAddress(text),
    country: extractCountry(text),
    // ... other fields
  };
}
```

### Option 2: Google Cloud Vision API

1. **Install Google Cloud Vision:**
```bash
npm install @google-cloud/vision
```

2. **Update function:**
```javascript
import vision from '@google-cloud/vision';

const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

async function extractIdInformation(idImageData) {
  const imageBuffer = Buffer.from(idImageData.split(',')[1], 'base64');
  
  const [result] = await client.textDetection({
    image: { content: imageBuffer }
  });
  
  const fullText = result.fullTextAnnotation?.text || '';
  const extractedData = parseOCRText(fullText);
  
  return {
    success: true,
    data: extractedData,
    ocrMetadata: {
      ocrEngine: 'GOOGLE_CLOUD_VISION',
      confidence: result.fullTextAnnotation?.pages[0]?.confidence || 0
    }
  };
}
```

### Option 3: Microsoft Azure Form Recognizer

1. **Install Azure SDK:**
```bash
npm install @azure/ai-form-recognizer
```

2. **Update function:**
```javascript
import { DocumentAnalysisClient, AzureKeyCredential } from '@azure/ai-form-recognizer';

const client = new DocumentAnalysisClient(
  process.env.AZURE_ENDPOINT,
  new AzureKeyCredential(process.env.AZURE_API_KEY)
);

async function extractIdInformation(idImageData) {
  const imageBuffer = Buffer.from(idImageData.split(',')[1], 'base64');
  
  const poller = await client.beginAnalyzeDocument('prebuilt-idDocument', imageBuffer);
  const result = await poller.pollUntilDone();
  
  // Extract structured data from result
  const extractedData = parseAzureResponse(result);
  
  return {
    success: true,
    data: extractedData,
    ocrMetadata: {
      ocrEngine: 'AZURE_FORM_RECOGNIZER',
      modelId: result.modelId
    }
  };
}
```

### Option 4: Third-Party Services (Onfido, Jumio, Veriff)

These services provide complete ID verification including OCR, face matching, and liveness detection:

**Onfido:**
```bash
npm install onfido
```

```javascript
import { Onfido } from '@onfido/api';

const onfido = new Onfido({
  apiToken: process.env.ONFIDO_API_TOKEN
});

async function extractIdInformation(idImageData) {
  // Upload document
  const document = await onfido.document.create({
    applicantId: applicantId,
    file: imageBuffer,
    type: 'driving_licence'
  });
  
  // Extract data
  const extractedData = await onfido.document.find(document.id);
  
  return {
    success: true,
    data: {
      documentType: extractedData.type,
      documentNumber: extractedData.documentNumbers?.[0]?.value,
      firstName: extractedData.firstName,
      lastName: extractedData.lastName,
      dateOfBirth: extractedData.dateOfBirth,
      address: extractedData.address,
      // ... other fields
    }
  };
}
```

## Face Matching Integration

### AWS Rekognition:
```javascript
import { RekognitionClient, CompareFacesCommand } from '@aws-sdk/client-rekognition';

async function matchFaceToId(selfieImageData, idImageData) {
  const client = new RekognitionClient({ region: 'us-east-1' });
  
  const selfieBuffer = Buffer.from(selfieImageData.split(',')[1], 'base64');
  const idBuffer = Buffer.from(idImageData.split(',')[1], 'base64');
  
  const command = new CompareFacesCommand({
    SourceImage: { Bytes: selfieBuffer },
    TargetImage: { Bytes: idBuffer },
    SimilarityThreshold: 70
  });
  
  const response = await client.send(command);
  
  return {
    success: true,
    data: {
      matchResult: {
        isMatch: response.FaceMatches?.length > 0,
        similarityScore: response.FaceMatches?.[0]?.Similarity / 100 || 0
      }
    }
  };
}
```

## Environment Variables Needed

Create a `.env` file in the `backend` directory:

```env
# AWS Textract
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# OR Google Cloud Vision
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# OR Azure
AZURE_ENDPOINT=https://your-endpoint.cognitiveservices.azure.com/
AZURE_API_KEY=your_key

# OR Third-party
ONFIDO_API_TOKEN=your_token
JUMIO_API_TOKEN=your_token
VERIFF_API_KEY=your_key
```

## Testing Real OCR

Once integrated, the system will:
1. Actually read text from your ID image
2. Extract real information (name, DOB, address, etc.)
3. Return your actual document number
4. Match your actual face from the selfie

## Current Implementation Notes

- **OCR**: Returns mock data (John Doe, 123 Main St, etc.)
- **Face Matching**: Returns random similarity scores (75-95%)
- **Document Validation**: Uses mock expiry dates
- **All checks work correctly** - just using simulated data

The infrastructure is ready - you just need to replace the mock functions with real API calls!

