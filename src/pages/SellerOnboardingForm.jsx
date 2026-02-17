import { useState, useRef, useEffect } from 'react'
import {
  User, Building, Mail, Phone, MapPin, CreditCard, FileText,
  Shield, CheckCircle, XCircle, Clock, AlertTriangle, Loader,
  ArrowRight, Sparkles, Brain, TrendingUp, Camera, Upload,
  FileCheck, Scan
} from 'lucide-react'

const API_BASE = '/api'

export default function SellerOnboardingForm() {
  const [formData, setFormData] = useState({
    // Business Information
    businessName: '',
    businessCategory: '',
    businessRegistrationNumber: '',
    businessAge: '',
    taxId: '',
    
    // Contact Information
    email: '',
    phone: '',
    country: '',
    address: '',
    
    // Identity & Verification
    documentType: '',
    documentNumber: '',
    kycVerified: false,
    bankVerified: false,
    
    // Financial Information
    bankName: '',
    accountNumber: '',
    routingNumber: '',
    accountHolderName: '',
    
    // Additional
    ipAddress: '',
    website: ''
  })

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState({})
  const [autoFilledNotification, setAutoFilledNotification] = useState(null)
  
  // Video refs for camera capture
  const selfieVideoRef = useRef(null)
  const idVideoRef = useRef(null)

  // ID Verification state
  const [idVerification, setIdVerification] = useState({
    selfieImage: null,
    idImage: null,
    selfiePreview: null,
    idPreview: null,
    verifying: false,
    result: null,
    workflowSteps: [],
    // Camera capture state
    cameraActive: { selfie: false, id: false },
    stream: null
  })

  // Set video stream when camera becomes active (backup for callback refs)
  useEffect(() => {
    if (idVerification.stream) {
      if (idVerification.cameraActive.selfie && selfieVideoRef.current) {
        selfieVideoRef.current.srcObject = idVerification.stream
      }
      if (idVerification.cameraActive.id && idVideoRef.current) {
        idVideoRef.current.srcObject = idVerification.stream
      }
    }
  }, [idVerification.stream, idVerification.cameraActive.selfie, idVerification.cameraActive.id])

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (idVerification.stream) {
        idVerification.stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const businessCategories = [
    'Electronics', 'Fashion', 'Home & Garden', 'Sports & Outdoors',
    'Automotive', 'Health & Beauty', 'Toys & Games', 'Books & Media',
    'Food & Beverage', 'Jewelry', 'Gift Cards', 'Tickets',
    'Digital Products', 'Services', 'Other'
  ]

  const countries = [
    'US', 'UK', 'CA', 'DE', 'FR', 'IT', 'ES', 'AU', 'JP', 'CN',
    'NG', 'RO', 'PK', 'BD', 'IN', 'BR', 'MX', 'RU', 'ZA', 'EG'
  ]

  const documentTypes = [
    'Passport', 'Driver License', 'National ID', 'Business License'
  ]

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  // Handle image upload
  const handleImageUpload = (type, file) => {
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64String = reader.result
      setIdVerification(prev => ({
        ...prev,
        [type === 'selfie' ? 'selfieImage' : 'idImage']: base64String,
        [type === 'selfie' ? 'selfiePreview' : 'idPreview']: base64String
      }))
    }
    reader.readAsDataURL(file)
  }

  // Start camera capture
  const startCamera = async (type) => {
    try {
      // Stop existing stream if any
      if (idVerification.stream) {
        idVerification.stream.getTracks().forEach(track => track.stop())
      }

      // Clear video refs
      if (selfieVideoRef.current) {
        selfieVideoRef.current.srcObject = null
      }
      if (idVideoRef.current) {
        idVideoRef.current.srcObject = null
      }

      // Try to get camera with preferred facing mode, fallback to any available camera
      let stream = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: type === 'selfie' ? 'user' : 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        })
      } catch (firstError) {
        // If preferred camera fails, try any available camera
        console.warn('Preferred camera failed, trying any available camera:', firstError)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        })
      }

      // Update state - useEffect will handle setting srcObject
      setIdVerification(prev => ({
        ...prev,
        cameraActive: { ...prev.cameraActive, [type]: true },
        stream
      }))
    } catch (error) {
      console.error('Error accessing camera:', error)
      alert(`Unable to access camera: ${error.message}. Please check permissions and ensure you're using HTTPS or localhost.`)
    }
  }

  // Stop camera
  const stopCamera = () => {
    if (idVerification.stream) {
      idVerification.stream.getTracks().forEach(track => track.stop())
      setIdVerification(prev => ({
        ...prev,
        cameraActive: { selfie: false, id: false },
        stream: null
      }))
    }
    if (selfieVideoRef.current) {
      selfieVideoRef.current.srcObject = null
    }
    if (idVideoRef.current) {
      idVideoRef.current.srcObject = null
    }
  }

  // Capture photo from camera
  const capturePhoto = (type) => {
    const videoRef = type === 'selfie' ? selfieVideoRef : idVideoRef
    if (!videoRef.current) {
      console.error('Video ref not available')
      alert('Camera not ready. Please try again.')
      return
    }

    const video = videoRef.current
    
    // Check if video is ready
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      console.error('Video not ready, readyState:', video.readyState)
      // Wait a bit and try again
      setTimeout(() => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          capturePhoto(type)
        } else {
          alert('Camera not ready. Please wait a moment and try again.')
        }
      }, 500)
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    
    if (canvas.width === 0 || canvas.height === 0) {
      console.error('Invalid video dimensions', canvas.width, canvas.height)
      alert('Unable to capture image. Please try again.')
      return
    }

    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)

    const base64String = canvas.toDataURL('image/jpeg', 0.9)
    
    console.log(`Image captured for ${type}, size: ${base64String.length} chars`)
    
    setIdVerification(prev => {
      const updated = {
        ...prev,
        [type === 'selfie' ? 'selfieImage' : 'idImage']: base64String,
        [type === 'selfie' ? 'selfiePreview' : 'idPreview']: base64String,
        cameraActive: { ...prev.cameraActive, [type]: false }
      }
      console.log('Updated state:', {
        hasSelfie: !!updated.selfieImage,
        hasId: !!updated.idImage,
        selfieLength: updated.selfieImage?.length,
        idLength: updated.idImage?.length
      })
      return updated
    })

    stopCamera()
  }

  // Handle ID verification
  const handleIdVerification = async () => {
    console.log('handleIdVerification called', {
      hasSelfie: !!idVerification.selfieImage,
      hasId: !!idVerification.idImage,
      selfieLength: idVerification.selfieImage?.length,
      idLength: idVerification.idImage?.length
    })

    if (!idVerification.selfieImage || !idVerification.idImage) {
      alert('Please upload both selfie and ID images')
      return
    }

    setIdVerification(prev => ({ ...prev, verifying: true, result: null, workflowSteps: [] }))

    try {
      // Generate temporary seller ID for saving images
      const tempSellerId = `TEMP-${Date.now().toString(36).toUpperCase()}`

      console.log('Sending verification request to:', `${API_BASE}/onboarding/id-verification`)

      const response = await fetch(`${API_BASE}/onboarding/id-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selfieImage: idVerification.selfieImage,
          idImage: idVerification.idImage,
          sellerId: tempSellerId
        })
      })

      console.log('Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Response error:', errorText)
        throw new Error(`Server error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      console.log('Response data:', data)

      if (data.success) {
        setIdVerification(prev => ({
          ...prev,
          verifying: false,
          result: {
            ...data.data,
            savedImageIds: data.savedImageIds
          },
          workflowSteps: data.steps || []
        }))

        // Auto-fill form with extracted data if available
        if (data.data?.extractedData) {
          const extracted = data.data.extractedData
          const autoFilledFields = []
          
          setFormData(prev => {
            const updated = { ...prev }
            
            // Auto-fill address information
            if (extracted.address && !prev.address) {
              updated.address = extracted.address
              autoFilledFields.push('Address')
            }
            
            // Auto-fill country
            if (extracted.country && !prev.country) {
              updated.country = extracted.country
              autoFilledFields.push('Country')
            }
            
            // Auto-fill state if available
            if (extracted.state) {
              // Could be used for address validation
            }
            
            // Auto-fill document information
            if (extracted.documentType && !prev.documentType) {
              // Map document type to form format
              const docTypeMap = {
                'DRIVER_LICENSE': 'Driver License',
                'PASSPORT': 'Passport',
                'NATIONAL_ID': 'National ID'
              }
              updated.documentType = docTypeMap[extracted.documentType] || extracted.documentType
              autoFilledFields.push('Document Type')
            }
            
            if (extracted.documentNumber && !prev.documentNumber) {
              updated.documentNumber = extracted.documentNumber
              autoFilledFields.push('Document Number')
            }
            
            // Show notification about auto-filled fields
            if (autoFilledFields.length > 0) {
              setAutoFilledNotification({
                fields: autoFilledFields,
                count: autoFilledFields.length
              })
              // Auto-hide after 5 seconds
              setTimeout(() => {
                setAutoFilledNotification(null)
              }, 5000)
            }
            
            return updated
          })
        }
      } else {
        console.error('Verification failed:', data.error)
        setIdVerification(prev => ({
          ...prev,
          verifying: false,
          result: { isValid: false, error: data.error || 'Verification failed' }
        }))
        alert(`Verification failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Verification error:', error)
      setIdVerification(prev => ({
        ...prev,
        verifying: false,
        result: { isValid: false, error: error.message }
      }))
      alert(`Error during verification: ${error.message}`)
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.businessName) newErrors.businessName = 'Business name is required'
    if (!formData.email) newErrors.email = 'Email is required'
    if (!formData.country) newErrors.country = 'Country is required'
    if (!formData.businessCategory) newErrors.businessCategory = 'Business category is required'
    if (!formData.phone) newErrors.phone = 'Phone is required'
    if (!formData.address) newErrors.address = 'Address is required'

    if (formData.email && !formData.email.includes('@')) {
      newErrors.email = 'Invalid email format'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setSubmitting(true)
    setResult(null)

    try {
      // Generate seller ID if not provided
      const sellerId = `SLR-${Date.now().toString(36).toUpperCase()}`
      
      // Update saved images with actual seller ID if they were saved with temp ID
      if (idVerification.result?.savedImageIds) {
        // Images are already saved, we'll update the seller_id reference when seller is created
      }
      
      // Prepare seller data
      const sellerData = {
        sellerId,
        ...formData,
        kycVerified: formData.kycVerified || (idVerification.result?.isValid || false),
        bankVerified: formData.bankVerified || false,
        createdAt: new Date().toISOString(),
        // Include ID verification results if available
        ...(idVerification.result && {
          idVerification: {
            isValid: idVerification.result.isValid,
            confidence: idVerification.result.confidence,
            extractedData: idVerification.result.extractedData,
            faceMatch: idVerification.result.faceMatch,
            validation: idVerification.result.validation,
            workflowId: idVerification.result.workflowId,
            savedImageIds: idVerification.result.savedImageIds
          }
        })
      }

      // Call onboarding API
      const response = await fetch(`${API_BASE}/onboarding/sellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sellerData)
      })

      const data = await response.json()

      if (data.success) {
        setResult({
          success: true,
          seller: data.data,
          evaluation: data.agentEvaluation,
          riskAssessment: data.data.onboardingRiskAssessment
        })
      } else {
        setResult({
          success: false,
          error: data.error || 'Failed to evaluate seller'
        })
      }
    } catch (error) {
      setResult({
        success: false,
        error: error.message || 'Network error occurred'
      })
    } finally {
      setSubmitting(false)
    }
  }

  const getDecisionColor = (decision) => {
    switch (decision) {
      case 'APPROVE': return 'emerald'
      case 'REJECT': return 'red'
      case 'REVIEW': return 'amber'
      default: return 'gray'
    }
  }

  const getDecisionIcon = (decision) => {
    switch (decision) {
      case 'APPROVE': return CheckCircle
      case 'REJECT': return XCircle
      case 'REVIEW': return Clock
      default: return AlertTriangle
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl">
            <User className="w-6 h-6 text-white" />
          </div>
          Seller Onboarding Form
        </h1>
        <p className="text-gray-400 mt-1">Submit seller information for AI-powered risk evaluation</p>
      </div>

      {/* Auto-fill Notification */}
      {autoFilledNotification && (
        <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <div>
            <div className="text-sm font-medium text-white">
              ✅ Auto-filled {autoFilledNotification.count} field(s) from your ID
            </div>
            <div className="text-xs text-gray-300 mt-1">
              {autoFilledNotification.fields.join(', ')} {autoFilledNotification.count === 1 ? 'has' : 'have'} been populated
            </div>
          </div>
          <button
            onClick={() => setAutoFilledNotification(null)}
            className="ml-auto text-gray-400 hover:text-white"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Form */}
        <div className="col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Business Information */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Building className="w-5 h-5 text-blue-400" />
                Business Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Business Name *</label>
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => handleChange('businessName', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white ${
                      errors.businessName ? 'border-red-500' : 'border-gray-700'
                    }`}
                    placeholder="Acme Corporation"
                  />
                  {errors.businessName && (
                    <p className="text-xs text-red-400 mt-1">{errors.businessName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Business Category *</label>
                  <select
                    value={formData.businessCategory}
                    onChange={(e) => handleChange('businessCategory', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white ${
                      errors.businessCategory ? 'border-red-500' : 'border-gray-700'
                    }`}
                  >
                    <option value="">Select category</option>
                    {businessCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {errors.businessCategory && (
                    <p className="text-xs text-red-400 mt-1">{errors.businessCategory}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Registration Number</label>
                  <input
                    type="text"
                    value={formData.businessRegistrationNumber}
                    onChange={(e) => handleChange('businessRegistrationNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="REG-123456"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Tax ID</label>
                  <input
                    type="text"
                    value={formData.taxId}
                    onChange={(e) => handleChange('taxId', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="TAX-123456"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Business Age (years)</label>
                  <input
                    type="number"
                    value={formData.businessAge}
                    onChange={(e) => handleChange('businessAge', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="5"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Website</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => handleChange('website', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="https://example.com"
                  />
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-400" />
                Contact Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white ${
                      errors.email ? 'border-red-500' : 'border-gray-700'
                    }`}
                    placeholder="seller@example.com"
                  />
                  {errors.email && (
                    <p className="text-xs text-red-400 mt-1">{errors.email}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Phone *</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white ${
                      errors.phone ? 'border-red-500' : 'border-gray-700'
                    }`}
                    placeholder="+1-555-123-4567"
                  />
                  {errors.phone && (
                    <p className="text-xs text-red-400 mt-1">{errors.phone}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Country *</label>
                  <select
                    value={formData.country}
                    onChange={(e) => handleChange('country', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white ${
                      errors.country ? 'border-red-500' : 'border-gray-700'
                    }`}
                  >
                    <option value="">Select country</option>
                    {countries.map(country => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                  {errors.country && (
                    <p className="text-xs text-red-400 mt-1">{errors.country}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">IP Address</label>
                  <input
                    type="text"
                    value={formData.ipAddress}
                    onChange={(e) => handleChange('ipAddress', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="192.168.1.1"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-2">Address *</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white ${
                      errors.address ? 'border-red-500' : 'border-gray-700'
                    }`}
                    placeholder="123 Main St, City, State, ZIP"
                  />
                  {errors.address && (
                    <p className="text-xs text-red-400 mt-1">{errors.address}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Financial Information */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-400" />
                Financial Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Bank Name</label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => handleChange('bankName', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="Chase Bank"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Account Holder Name</label>
                  <input
                    type="text"
                    value={formData.accountHolderName}
                    onChange={(e) => handleChange('accountHolderName', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Account Number</label>
                  <input
                    type="text"
                    value={formData.accountNumber}
                    onChange={(e) => handleChange('accountNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="****1234"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Routing Number</label>
                  <input
                    type="text"
                    value={formData.routingNumber}
                    onChange={(e) => handleChange('routingNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="123456789"
                  />
                </div>
              </div>
            </div>

            {/* ID Verification Workflow */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Scan className="w-5 h-5 text-blue-400" />
                ID Verification & Document Scanning
              </h3>
              <div className="mb-4 space-y-2">
                <p className="text-xs text-gray-400">
                  <strong className="text-white">Step 1:</strong> Capture or upload your selfie and ID document
                </p>
                <p className="text-xs text-gray-400">
                  <strong className="text-white">Step 2:</strong> Click "Scan & Verify ID" to extract information and verify authenticity
                </p>
                <p className="text-xs text-emerald-400">
                  <strong>✨ Auto-fill:</strong> The system will automatically populate form fields from your ID (address, country, document info)
                </p>
                <p className="text-xs text-amber-400 bg-amber-500/10 p-2 rounded">
                  ⚠️ <strong>Note:</strong> Currently using simulated OCR. The extracted data is mock/demo data. 
                  See <code className="text-xs">REAL_OCR_INTEGRATION.md</code> to enable real OCR services (AWS Textract, Google Vision, Azure, etc.)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* Selfie Upload/Capture */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Selfie Photo *</label>
                  <div className="relative">
                    {idVerification.cameraActive.selfie ? (
                      <div className="relative">
                        <video
                          ref={(el) => {
                            selfieVideoRef.current = el
                            if (el && idVerification.stream) {
                              el.srcObject = idVerification.stream
                            }
                          }}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-48 rounded-lg bg-gray-900 object-cover"
                        />
                        <div className="absolute bottom-2 left-0 right-0 flex gap-2 justify-center">
                          <button
                            type="button"
                            onClick={() => capturePhoto('selfie')}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium"
                          >
                            <Camera className="w-4 h-4 inline mr-1" />
                            Capture
                          </button>
                          <button
                            type="button"
                            onClick={stopCamera}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : idVerification.selfiePreview ? (
                      <div className="relative">
                        <img
                          src={idVerification.selfiePreview}
                          alt="Selfie preview"
                          className="w-full h-48 object-cover rounded-lg"
                        />
                        <div className="absolute top-2 left-2 px-2 py-1 bg-emerald-500/90 rounded text-xs text-white flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Captured
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIdVerification(prev => ({
                              ...prev,
                              selfieImage: null,
                              selfiePreview: null
                            }))
                          }}
                          className="absolute top-2 right-2 p-1 bg-red-600 hover:bg-red-700 rounded-full text-white"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-700 rounded-lg bg-gray-800/50">
                          <Camera className="w-8 h-8 text-gray-500 mb-2" />
                          <span className="text-xs text-gray-400 mb-2">Capture or upload selfie</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startCamera('selfie')}
                            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-xs font-medium flex items-center justify-center gap-1"
                          >
                            <Camera className="w-4 h-4" />
                            Use Camera
                          </button>
                          <label className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs font-medium flex items-center justify-center gap-1 cursor-pointer">
                            <Upload className="w-4 h-4" />
                            Upload File
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageUpload('selfie', e.target.files[0])}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ID Upload/Capture */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">ID Document *</label>
                  <div className="relative">
                    {idVerification.cameraActive.id ? (
                      <div className="relative">
                        <video
                          ref={(el) => {
                            idVideoRef.current = el
                            if (el && idVerification.stream) {
                              el.srcObject = idVerification.stream
                            }
                          }}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-48 rounded-lg bg-gray-900 object-cover"
                        />
                        <div className="absolute bottom-2 left-0 right-0 flex gap-2 justify-center">
                          <button
                            type="button"
                            onClick={() => capturePhoto('id')}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium"
                          >
                            <Camera className="w-4 h-4 inline mr-1" />
                            Capture
                          </button>
                          <button
                            type="button"
                            onClick={stopCamera}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : idVerification.idPreview ? (
                      <div className="relative">
                        <img
                          src={idVerification.idPreview}
                          alt="ID preview"
                          className="w-full h-48 object-cover rounded-lg"
                        />
                        <div className="absolute top-2 left-2 px-2 py-1 bg-emerald-500/90 rounded text-xs text-white flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Captured
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIdVerification(prev => ({
                              ...prev,
                              idImage: null,
                              idPreview: null
                            }))
                          }}
                          className="absolute top-2 right-2 p-1 bg-red-600 hover:bg-red-700 rounded-full text-white"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-700 rounded-lg bg-gray-800/50">
                          <FileCheck className="w-8 h-8 text-gray-500 mb-2" />
                          <span className="text-xs text-gray-400 mb-2">Capture or upload ID</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startCamera('id')}
                            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-xs font-medium flex items-center justify-center gap-1"
                          >
                            <Camera className="w-4 h-4" />
                            Use Camera
                          </button>
                          <label className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs font-medium flex items-center justify-center gap-1 cursor-pointer">
                            <Upload className="w-4 h-4" />
                            Upload File
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageUpload('id', e.target.files[0])}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Verify Button */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    console.log('Button clicked, current state:', {
                      hasSelfie: !!idVerification.selfieImage,
                      hasId: !!idVerification.idImage,
                      verifying: idVerification.verifying
                    })
                    handleIdVerification()
                  }}
                  disabled={!idVerification.selfieImage || !idVerification.idImage || idVerification.verifying}
                  className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {idVerification.verifying ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Scanning & Extracting Information...
                    </>
                  ) : (
                    <>
                      <Scan className="w-5 h-5" />
                      Scan & Verify ID (Auto-fill Form)
                    </>
                  )}
                </button>
                {(!idVerification.selfieImage || !idVerification.idImage) && (
                  <p className="text-xs text-amber-400 text-center">
                    {!idVerification.selfieImage && !idVerification.idImage 
                      ? 'Please capture or upload both selfie and ID images'
                      : !idVerification.selfieImage 
                        ? 'Please capture or upload selfie image'
                        : 'Please capture or upload ID document'}
                  </p>
                )}
                {idVerification.selfieImage && idVerification.idImage && !idVerification.verifying && !idVerification.result && (
                  <p className="text-xs text-blue-400 text-center">
                    ✓ Ready to scan! Click above to extract information from your ID
                  </p>
                )}
              </div>

              {/* Verification Results */}
              {idVerification.result && (
                <div className={`mt-4 p-4 rounded-lg border ${
                  idVerification.result.isValid
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-white flex items-center gap-2">
                      <FileCheck className="w-4 h-4" />
                      Verification Result
                    </h4>
                    {idVerification.result.isValid ? (
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400" />
                    )}
                  </div>

                  {idVerification.result.extractedData && (
                    <div className="mb-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <FileCheck className="w-3 h-3 text-gray-400" />
                        <span className="text-gray-400">Extracted Information (auto-filled in form):</span>
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-medium">
                          SIMULATED
                        </span>
                      </div>
                      <div className="text-xs text-amber-400 bg-amber-500/10 p-2 rounded">
                        ⚠️ Currently using simulated OCR. Real ID data will be extracted when real OCR service is integrated.
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs bg-gray-800/50 p-2 rounded">
                        <div>
                          <span className="text-gray-500">Name:</span>
                          <span className="text-white ml-2">
                            {idVerification.result.extractedData.firstName} {idVerification.result.extractedData.lastName}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">DOB:</span>
                          <span className="text-white ml-2">{idVerification.result.extractedData.dateOfBirth}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Document #:</span>
                          <span className="text-emerald-400 ml-2 font-mono">
                            {idVerification.result.extractedData.documentNumber}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Expiry:</span>
                          <span className="text-white ml-2">{idVerification.result.extractedData.expiryDate}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Address:</span>
                          <span className="text-emerald-400 ml-2">
                            {idVerification.result.extractedData.address}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Country:</span>
                          <span className="text-emerald-400 ml-2">
                            {idVerification.result.extractedData.country}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        <span>Form fields have been auto-filled with this information</span>
                      </div>
                    </div>
                  )}

                  {idVerification.result.faceMatch && (
                    <div className="mb-3 p-2 bg-gray-800/50 rounded">
                      <div className="text-xs text-gray-400 mb-1">Face Matching:</div>
                      <div className="flex items-center gap-2">
                        {idVerification.result.faceMatch.matchResult.isMatch ? (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span className="text-xs text-white">
                          {idVerification.result.faceMatch.matchResult.isMatch ? 'Match' : 'No Match'} 
                          ({(idVerification.result.faceMatch.matchResult.similarityScore * 100).toFixed(0)}% similarity)
                        </span>
                      </div>
                    </div>
                  )}

                  {idVerification.result.validation && (
                    <div className="mb-3">
                      <div className="text-xs text-gray-400 mb-1">Document Validation:</div>
                      <div className="space-y-1">
                        {idVerification.result.validation.issues.length > 0 && (
                          <div className="text-xs text-red-400">
                            Issues: {idVerification.result.validation.issues.join(', ')}
                          </div>
                        )}
                        {idVerification.result.validation.warnings.length > 0 && (
                          <div className="text-xs text-amber-400">
                            Warnings: {idVerification.result.validation.warnings.join(', ')}
                          </div>
                        )}
                        <div className="text-xs text-gray-300">
                          Validation Score: {idVerification.result.validation.validationScore.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-gray-700">
                    <div className="text-xs text-gray-400">
                      Overall Confidence: {(idVerification.result.confidence * 100).toFixed(0)}%
                    </div>
                    {idVerification.result.savedImageIds && (
                      <div className="text-xs text-emerald-400 mt-1">
                        ✓ Images saved to database
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Workflow Steps */}
              {idVerification.workflowSteps.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-xs text-gray-400 mb-2">Verification Steps:</div>
                  {idVerification.workflowSteps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      {step.status === 'completed' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : step.status === 'processing' ? (
                        <Loader className="w-4 h-4 animate-spin text-blue-400" />
                      ) : (
                        <Clock className="w-4 h-4 text-gray-500" />
                      )}
                      <span className="text-gray-300 capitalize">
                        {step.step.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Identity Verification (Manual Entry) */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                Identity Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Document Type</label>
                  <select
                    value={formData.documentType}
                    onChange={(e) => handleChange('documentType', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  >
                    <option value="">Select document type</option>
                    {documentTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Document Number</label>
                  <input
                    type="text"
                    value={formData.documentNumber}
                    onChange={(e) => handleChange('documentNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="DOC123456"
                  />
                </div>
                <div className="col-span-2 flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.kycVerified}
                      onChange={(e) => handleChange('kycVerified', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-700 bg-gray-800"
                    />
                    <span className="text-sm text-gray-300">KYC Verified</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.bankVerified}
                      onChange={(e) => handleChange('bankVerified', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-700 bg-gray-800"
                    />
                    <span className="text-sm text-gray-300">Bank Verified</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-lg flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Submit for AI Evaluation
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Result Panel */}
        <div className="space-y-4">
          {result && (
            <div className={`bg-[#12121a] rounded-xl border p-6 ${
              result.success 
                ? result.evaluation?.decision === 'APPROVE' ? 'border-emerald-500/30' :
                  result.evaluation?.decision === 'REJECT' ? 'border-red-500/30' :
                  'border-amber-500/30'
                : 'border-red-500/30'
            }`}>
              {result.success ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Brain className="w-5 h-5 text-blue-400" />
                      Agent Decision
                    </h3>
                    {(() => {
                      const DecisionIcon = getDecisionIcon(result.evaluation?.decision || 'REVIEW')
                      const color = getDecisionColor(result.evaluation?.decision || 'REVIEW')
                      return (
                        <div className={`p-2 rounded-lg bg-${color}-500/20`}>
                          <DecisionIcon className={`w-6 h-6 text-${color}-400`} />
                        </div>
                      )
                    })()}
                  </div>

                  <div className={`p-4 rounded-lg mb-4 bg-${getDecisionColor(result.evaluation?.decision || 'REVIEW')}-500/10 border border-${getDecisionColor(result.evaluation?.decision || 'REVIEW')}-500/30`}>
                    <div className="text-2xl font-bold text-white mb-1">
                      {result.evaluation?.decision || 'REVIEW'}
                    </div>
                    <div className="text-sm text-gray-400">
                      Confidence: {((result.evaluation?.confidence || 0) * 100).toFixed(0)}%
                    </div>
                  </div>

                  {result.riskAssessment && (
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Risk Score</div>
                        <div className="text-xl font-bold text-white">
                          {result.riskAssessment.riskScore}/100
                        </div>
                      </div>
                      {result.riskAssessment.signals && result.riskAssessment.signals.length > 0 && (
                        <div>
                          <div className="text-xs text-gray-400 mb-2">Risk Signals</div>
                          <div className="space-y-1">
                            {result.riskAssessment.signals.slice(0, 5).map((signal, i) => (
                              <div key={i} className="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded">
                                {signal.signal || signal}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.riskAssessment.agentEvaluation && (
                        <div className="pt-3 border-t border-gray-700">
                          <div className="text-xs text-gray-400 mb-1">Agent Analysis</div>
                          <div className="text-xs text-gray-300">
                            {result.riskAssessment.agentEvaluation.evidenceGathered} checks performed
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-1">Seller ID</div>
                    <div className="text-xs font-mono text-white">
                      {result.seller?.sellerId}
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <div className="text-red-400 font-medium mb-2">Error</div>
                  <div className="text-sm text-gray-400">{result.error}</div>
                </div>
              )}
            </div>
          )}

          {/* Info Card */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              AI Evaluation Process
            </h4>
            <div className="text-xs text-gray-400 space-y-1">
              <p>• Agent performs 15+ verification checks</p>
              <p>• Analyzes risk factors and patterns</p>
              <p>• Makes decision with confidence score</p>
              <p>• Provides full reasoning chain</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

