import React, { useState, useEffect, useCallback } from 'react';
import { 
  Camera, FolderOpen, Link as LinkIcon, Plus, LogOut, 
  X, ChevronLeft, ChevronRight, Download, Share2, 
  Image as ImageIcon, Trash2, CheckCircle2, Settings, Key
} from 'lucide-react';

// --- FIREBASE CONFIGURATION & INIT ---
import { signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
// @ts-ignore
import { auth, db } from './firebase';

const appId = '1:91303472070:web:f9dbd5c22ad119c618e0c7';

declare var __initial_auth_token: string | undefined;

// --- MOCK DATA & SERVICES ---
// In the real app, this would be stored in Firebase Firestore
const initialGalleries = [
  { id: 'wedding-sarah-john', title: 'Sarah & John - Wedding Day', folderId: '1A2b3C4d5E...', date: '2026-05-20' },
  { id: 'portrait-emma', title: 'Emma - Portrait Session', folderId: '9Z8y7X6w5V...', date: '2026-05-15' },
];

// Simulates fetching images from Google Drive API
const fetchMockImages = (folderId: string) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Generate some high-quality unsplash images for the prototype
      const mockImages = Array.from({ length: 15 }).map((_, i) => {
        // Mixing portraits and landscapes for the masonry effect
        const width = 800;
        const height = i % 3 === 0 ? 1200 : (i % 2 === 0 ? 800 : 533); 
        const randomSig = Math.floor(Math.random() * 1000) + folderId;
        return {
          id: `img-${i}`,
          // Switched to picsum.photos because source.unsplash.com was deprecated
          url: `https://picsum.photos/seed/${randomSig}/${width}/${height}`,
          alt: `Photo ${i + 1}`
        };
      });
      resolve(mockImages);
    }, 800); // Simulate network delay
  });
};

// Real Google Drive API Fetcher
const fetchRealDriveImages = async (folderId: string, apiKey: string) => {
  try {
    const query = encodeURIComponent(`'${folderId}' in parents and mimeType contains 'image/'`);
    // Added webContentLink as a fallback if thumbnailLink is missing
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,thumbnailLink,webContentLink)&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error("Drive API Error:", data.error.message);
      throw new Error(data.error.message);
    }

    if (!data.files) return [];

    return data.files.map((file: any) => {
      // 1. Try to use thumbnailLink and upgrade its resolution.
      // Drive thumbnails default to a small size (=s220). We replace it with =s1600.
      // Some links have extra query params, so we replace =s\d+ anywhere.
      let highResUrl;
      
      if (file.thumbnailLink) {
        highResUrl = file.thumbnailLink.replace(/=s\d+(?:-[^=]+)?/, '=s1600');
      } else {
        // 2. Fallback: webContentLink is blocked by browsers in <img> tags (Content-Disposition: attachment).
        // Instead, we use the Drive thumbnail endpoint which works perfectly for public files.
        highResUrl = `https://drive.google.com/thumbnail?id=${file.id}&sz=w1600`;
      }

      return {
        id: file.id,
        url: highResUrl,
        alt: file.name
      };
    });
  } catch (err) {
    console.error("Failed to fetch from Drive:", err);
    throw err; // Throw the error so the UI can display it
  }
};

// --- COMPONENTS ---

// 1. Toast Notification Component
const Toast = ({ message, onClose }: any) => {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 z-50 animate-fade-in-up">
      <CheckCircle2 size={18} className="text-green-400" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
};

// 2. Client Gallery View Component
const ClientGallery = ({ gallery, apiKey, onBackToAdmin }: any) => {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    
    if (apiKey && gallery.folderId !== 'demo' && !gallery.folderId.includes('...')) {
      // Use real Google Drive API
      fetchRealDriveImages(gallery.folderId, apiKey)
        .then(fetchedImages => {
          setImages(fetchedImages);
          setLoading(false);
        })
        .catch(err => {
          // Display the exact error message from Google
          setError(`Google API Error: ${err.message}. Please verify your API Key and Folder ID.`);
          setLoading(false);
        });
    } else {
      // Fallback to mock images if no API key or using dummy data
      fetchMockImages(gallery.folderId).then((fetchedImages: any) => {
        setImages(fetchedImages);
        setLoading(false);
      });
    }
  }, [gallery]);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const nextImage = (e: any) => { e.stopPropagation(); setLightboxIndex((prev) => prev !== null ? (prev + 1) % images.length : 0); };
  const prevImage = (e: any) => { e.stopPropagation(); setLightboxIndex((prev) => prev !== null ? (prev - 1 + images.length) % images.length : 0); };

  // Function to handle direct image downloading
  const handleDownload = async (imageUrl: string, filename: string, e: any) => {
    e.stopPropagation(); // Prevent opening the lightbox if clicked from the grid
    try {
      // Fetch the image as a blob
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // Attempt to use native mobile share/save if available (iOS/Android)
      // This allows the user to save directly to their photo gallery!
      if (navigator.canShare) {
        const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: filename,
          });
          return; // Success, user used the native share sheet
        }
      }

      // Fallback for desktop or unsupported browsers
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || 'photo.jpg';
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      // Fallback for CORS issues during prototyping
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = filename || 'photo.jpg';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Handle keyboard navigation in lightbox
  useEffect(() => {
    const handleKeyDown = (e: any) => {
      if (lightboxIndex === null) return;
      if (e.key === 'ArrowRight') nextImage(e);
      if (e.key === 'ArrowLeft') prevImage(e);
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex]);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* Client Header */}
      <header className="py-12 px-6 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-4 text-gray-900">{gallery.title}</h1>
        <p className="text-gray-500 uppercase tracking-widest text-sm font-semibold">Client Gallery</p>
      </header>

      {/* Admin quick back button (only visible if admin is viewing) */}
      {onBackToAdmin && (
        <button onClick={onBackToAdmin} className="fixed top-4 left-4 bg-gray-100 text-gray-700 px-4 py-2 rounded-full text-sm font-medium hover:bg-gray-200 transition z-40 shadow-sm flex items-center gap-2">
          <ChevronLeft size={16} /> Back to Dashboard
        </button>
      )}

      {/* Gallery Grid */}
      <main className="px-4 md:px-8 pb-20 max-w-7xl mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400 gap-4">
            <Camera className="animate-pulse" size={48} />
            <p className="text-sm font-medium tracking-wide">Loading your photos...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-32 text-red-500 gap-4 max-w-xl mx-auto text-center px-4">
            <X size={48} />
            <div className="bg-red-50 text-red-800 p-6 rounded-xl border border-red-100 text-sm font-medium tracking-wide shadow-sm">
              {error}
            </div>
            <p className="text-gray-500 text-sm mt-4">Check that the Drive Folder is set to "Anyone with the link".</p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
            {images.map((img, index) => (
              <div 
                key={img.id} 
                className="break-inside-avoid cursor-pointer overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300 group relative"
                onClick={() => openLightbox(index)}
              >
                {/* Fallback gray background while image loads */}
                <div className="bg-gray-100 w-full min-h-[200px]">
                  <img 
                    src={img.url} 
                    alt={img.alt} 
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-500 ease-out"
                  />
                </div>
                {/* Hover overlay with download button */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-end justify-end p-3 opacity-0 group-hover:opacity-100">
                  <button 
                    onClick={(e) => handleDownload(img.url, `${gallery.id}-photo-${index + 1}.jpg`, e)}
                    className="bg-white/90 text-gray-900 p-2 rounded-full hover:bg-white hover:scale-110 transition-all shadow-sm"
                    title="Download Image"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center touch-none" onClick={closeLightbox}>
          {/* Top Controls */}
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-50 bg-gradient-to-b from-black/50 to-transparent">
            <div className="text-white/70 text-sm font-medium px-4">
              {lightboxIndex + 1} / {images.length}
            </div>
            <div className="flex gap-4">
              <button 
                className="text-white/70 hover:text-white transition p-2" 
                onClick={(e) => handleDownload(images[lightboxIndex].url, `${gallery.id}-photo-${lightboxIndex + 1}.jpg`, e)} 
                title="Download"
              >
                <Download size={24} />
              </button>
              <button className="text-white/70 hover:text-white transition p-2" onClick={closeLightbox} title="Close">
                <X size={28} />
              </button>
            </div>
          </div>

          {/* Image */}
          <div className="relative w-full h-full flex items-center justify-center p-4 md:p-12">
            <img 
              src={images[lightboxIndex].url} 
              alt="Fullscreen" 
              referrerPolicy="no-referrer"
              className="max-w-full max-h-full object-contain select-none shadow-2xl"
              onClick={(e) => e.stopPropagation()} 
            />
          </div>

          {/* Navigation */}
          <button onClick={prevImage} className="absolute left-2 md:left-8 text-white/50 hover:text-white p-3 rounded-full hover:bg-white/10 transition z-50">
            <ChevronLeft size={40} />
          </button>
          <button onClick={nextImage} className="absolute right-2 md:right-8 text-white/50 hover:text-white p-3 rounded-full hover:bg-white/10 transition z-50">
            <ChevronRight size={40} />
          </button>
        </div>
      )}
    </div>
  );
};

// 3. Admin Dashboard Component
const AdminDashboard = ({ galleries, apiKey, onCreateGallery, onDeleteGallery, onSaveApiKey, onPreviewGallery, onLogout }: any) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFolderId, setNewFolderId] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [activeTab, setActiveTab] = useState('galleries'); // 'galleries' or 'settings'
  const [localApiKey, setLocalApiKey] = useState(apiKey || '');

  useEffect(() => {
    setLocalApiKey(apiKey || '');
  }, [apiKey]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newFolderId.trim()) return;
    
    const newGallery = {
      id: newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Math.floor(Math.random() * 1000),
      title: newTitle,
      folderId: newFolderId,
      date: new Date().toISOString().split('T')[0]
    };
    
    onCreateGallery(newGallery);
    setIsCreating(false);
    setNewTitle('');
    setNewFolderId('');
    showToast('Gallery created successfully!');
  };

  const deleteGallery = (id: string) => {
    // In a real app, use a custom modal. For prototype, direct delete is fine.
    onDeleteGallery(id);
    showToast('Gallery deleted');
  };

  const copyLink = (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}#gallery/${id}`;
    
    // Use document.execCommand for iframe compatibility (Canvas environment)
    const textArea = document.createElement("textarea");
    textArea.value = url;
    // Prevent scrolling to bottom of page in MS Edge.
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('Client link copied to clipboard!');
    } catch (err) {
      showToast('Failed to copy link.');
    }
    document.body.removeChild(textArea);
  };

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveApiKey(localApiKey);
    showToast('Settings saved to cloud!');
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      <Toast message={toastMessage} onClose={() => setToastMessage('')} />
      
      {/* Top Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 text-gray-900">
            <div className="bg-gray-900 text-white p-2 rounded-lg">
              <Camera size={20} />
            </div>
            <span className="font-bold text-xl tracking-tight hidden md:inline">Studio Admin</span>
          </div>
          
          <div className="flex gap-1 ml-4 border-l border-gray-200 pl-6">
            <button 
              onClick={() => setActiveTab('galleries')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'galleries' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Galleries
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${activeTab === 'settings' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <Settings size={16} /> Settings
            </button>
          </div>
        </div>

        <button onClick={onLogout} className="text-gray-500 hover:text-gray-900 flex items-center gap-2 text-sm font-medium transition">
          <LogOut size={18} /> Logout
        </button>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {activeTab === 'galleries' ? (
          <>
            <div className="flex justify-between items-end mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Client Galleries</h1>
                <p className="text-gray-500">Manage your connected Google Drive folders.</p>
              </div>
              <button 
                onClick={() => setIsCreating(!isCreating)}
                className="bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition shadow-sm"
              >
                {isCreating ? <X size={18} /> : <Plus size={18} />}
                {isCreating ? 'Cancel' : 'New Gallery'}
              </button>
            </div>

            {/* Create Form Dropdown */}
            {isCreating && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8 animate-in slide-in-from-top-4 fade-in duration-200">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <FolderOpen size={20} className="text-blue-500" /> Connect Google Drive Folder
                </h2>
                <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-5">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gallery Title (for Client)</label>
                    <input 
                      type="text" 
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g. Smith Family Portraits"
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition"
                      required
                    />
                  </div>
                  <div className="md:col-span-5">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Google Drive Folder ID</label>
                    <input 
                      type="text" 
                      value={newFolderId}
                      onChange={(e) => setNewFolderId(e.target.value)}
                      placeholder="Paste folder ID here"
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition font-mono text-sm"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition shadow-sm">
                      Create
                    </button>
                  </div>
                </form>
                <div className="mt-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm flex gap-3">
                  <div className="mt-0.5"><CheckCircle2 size={16} /></div>
                  <p>Make sure your Google Drive folder access is set to <strong>"Anyone with the link"</strong> before creating.</p>
                </div>
              </div>
            )}

        {/* Gallery List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {galleries.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <ImageIcon size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-1">No galleries yet</p>
              <p>Click "New Gallery" to connect your first Google Drive folder.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider border-b border-gray-200">
                    <th className="px-6 py-4 font-semibold">Gallery Name</th>
                    <th className="px-6 py-4 font-semibold">Drive ID</th>
                    <th className="px-6 py-4 font-semibold">Created</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {galleries.map((g: any) => (
                    <tr key={g.id} className="hover:bg-gray-50 transition group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{g.title}</div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <LinkIcon size={12} /> /gallery/{g.id}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded truncate max-w-[120px] inline-block">
                          {g.folderId}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{g.date}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => onPreviewGallery(g.id)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Preview Gallery">
                          <Camera size={18} />
                        </button>
                        <button onClick={() => copyLink(g.id)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition" title="Copy Client Link">
                          <Share2 size={18} />
                        </button>
                        <button onClick={() => deleteGallery(g.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete">
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
        ) : (
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
            <p className="text-gray-500 mb-8">Configure your integrations and studio details.</p>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Key size={20} className="text-blue-500" /> Google Drive API Configuration
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                To display your actual photos, you need a free Google Cloud API key with access to the Google Drive API. 
              </p>
              
              <form onSubmit={saveSettings}>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input 
                  type="password" 
                  value={localApiKey}
                  onChange={(e) => setLocalApiKey(e.target.value)}
                  placeholder="AIzaSyA..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition font-mono mb-4"
                />
                <button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-2.5 rounded-lg font-medium transition shadow-sm">
                  Save Settings
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// 4. Main App / Router Component
export default function App() {
  const [currentRoute, setCurrentRoute] = useState('login');
  const [activeGalleryId, setActiveGalleryId] = useState<string | null>(null);

  // Cloud State replacing Local Storage
  const [user, setUser] = useState<any>(null);
  const [galleries, setGalleries] = useState<any[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [isLoadingDb, setIsLoadingDb] = useState(true);

  // Firebase Auth Initialization
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Firebase Firestore Listeners
  useEffect(() => {
    if (!user) return;

    setIsLoadingDb(true);
    
    // 1. Listen to Galleries in Cloud
    const galleriesRef = collection(db, 'artifacts', appId, 'public', 'data', 'galleries');
    const unsubGalleries = onSnapshot(galleriesRef, (snapshot) => {
      const loaded = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort newest galleries first based on date
      loaded.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setGalleries(loaded);
      setIsLoadingDb(false);
    }, console.error);

    // 2. Listen to Settings in Cloud
    const settingsDoc = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config');
    const unsubSettings = onSnapshot(settingsDoc, (snapshot) => {
      if (snapshot.exists() && snapshot.data().driveApiKey) {
        setApiKey(snapshot.data().driveApiKey);
      }
    }, console.error);

    return () => { 
      unsubGalleries(); 
      unsubSettings(); 
    };
  }, [user]);

  // Cloud Database Actions
  const handleCreateGallery = async (newGallery: any) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'galleries', newGallery.id), newGallery);
    } catch (err) {
      console.error("Error creating gallery:", err);
    }
  };

  const handleDeleteGallery = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'galleries', id));
    } catch (err) {
      console.error("Error deleting gallery:", err);
    }
  };

  const handleSaveApiKey = async (newKey: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { 
        driveApiKey: newKey 
      }, { merge: true });
    } catch (err) {
      console.error("Error saving API Key:", err);
    }
  };

  // Simple Hash Router effect to handle fake URLs
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#gallery/')) {
        const id = hash.replace('#gallery/', '');
        setActiveGalleryId(id);
        setCurrentRoute('client-gallery');
      } else if (hash === '#admin') {
        setCurrentRoute('admin');
      } else {
        setCurrentRoute('login');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Check on initial load
    
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Helpers to navigate without real router
  const goToAdmin = () => window.location.hash = 'admin';
  const previewGallery = (id: string) => window.location.hash = `gallery/${id}`;
  const handleLogout = () => window.location.hash = '';

  // Render logic based on route
  if (currentRoute === 'client-gallery' && activeGalleryId) {
    if (isLoadingDb) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
          <Camera className="animate-pulse text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-medium">Loading Gallery...</p>
        </div>
      );
    }

    // Find the gallery info to pass to the client view from the lifted state
    const galleryInfo = galleries.find(g => g.id === activeGalleryId) || { 
      title: 'Gallery Not Found', 
      folderId: 'error' 
    };
    return <ClientGallery gallery={galleryInfo} apiKey={apiKey} onBackToAdmin={goToAdmin} />;
  }

  if (currentRoute === 'admin') {
    if (isLoadingDb) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
          <Camera className="animate-pulse text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-medium">Connecting to Cloud Dashboard...</p>
        </div>
      );
    }
    return (
      <AdminDashboard 
        galleries={galleries} 
        apiKey={apiKey}
        onCreateGallery={handleCreateGallery}
        onDeleteGallery={handleDeleteGallery}
        onSaveApiKey={handleSaveApiKey}
        onPreviewGallery={previewGallery} 
        onLogout={handleLogout} 
      />
    );
  }

  // Default: Simple Mock Login Page
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 font-sans text-gray-800">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl p-8 text-center animate-fade-in-up">
        <div className="w-16 h-16 bg-gray-900 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-md">
          <Camera size={32} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Photographer Login</h1>
        <p className="text-gray-500 mb-8 text-sm">Access your Google Drive gallery dashboard.</p>
        
        <form onSubmit={(e) => { e.preventDefault(); goToAdmin(); }} className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" defaultValue="admin@studio.com" className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" defaultValue="password" className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition" />
          </div>
          <button type="submit" className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-lg font-medium transition shadow-md mt-4">
            Sign In
          </button>
        </form>
        
        <div className="mt-8 text-xs text-gray-400 bg-gray-50 p-4 rounded-lg">
          <strong>Prototype Note:</strong> Just click "Sign In" to view the admin dashboard. No real credentials needed for this preview.
        </div>
      </div>
    </div>
  );
}