import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, Bell, Bookmark, Camera, Check, ChevronDown,
  Compass, Globe2, Heart, Home, ImagePlus, LogOut, MessageCircle, MoreHorizontal,
  Maximize2, Moon, PenLine, Plus, Search, Send, Share2, Smile,
  ShieldCheck, Sun, UserRound, X,
} from 'lucide-react';

const API = '/api';
const avatarPhotos = [
  'photo-1534528741775-53994a69daeb',
  'photo-1500648767791-00dcc994a43e',
  'photo-1531123897727-8f129e1688ce',
  'photo-1506794778202-cad84cf45f1d',
  'photo-1524504388940-b1c1722653e1',
  'photo-1507003211169-0a1dd7228f2d',
];
const photo = (id, width = 100) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;
const formatFileSize = (bytes) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
const reactionOptions = [
  { kind: 'like', label: 'Like', emoji: '👍' },
  { kind: 'love', label: 'Love', emoji: '❤️' },
  { kind: 'haha', label: 'Haha', emoji: '😂' },
  { kind: 'wow', label: 'Wow', emoji: '😮' },
  { kind: 'sad', label: 'Sad', emoji: '😢' },
  { kind: 'angry', label: 'Angry', emoji: '😡' },
];
function inspectMedia(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const finish = (width, height) => {
      URL.revokeObjectURL(url);
      resolve({ size: formatFileSize(file.size), dimensions: width && height ? `${width} × ${height} px` : 'Dimensions unavailable' });
    };
    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => finish(video.videoWidth, video.videoHeight);
      video.onerror = () => finish(0, 0);
      video.src = url;
    } else {
      const image = new Image();
      image.onload = () => finish(image.naturalWidth, image.naturalHeight);
      image.onerror = () => finish(0, 0);
      image.src = url;
    }
  });
}
function useMediaInfo(file) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!file) {
      setInfo(null);
      return undefined;
    }
    let active = true;
    inspectMedia(file).then((details) => { if (active) setInfo(details); });
    return () => { active = false; };
  }, [file]);
  return info;
}
async function api(path, options = {}) {
  const { headers, ...rest } = options;
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...rest,
    headers: { ...(rest.body && !(rest.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...headers },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
async function sharePost(postId) {
  const link = `${window.location.origin}/?post=${postId}`;
  if (!navigator.clipboard?.writeText) return notify('Clipboard access is unavailable in this browser.');
  try {
    await navigator.clipboard.writeText(link);
    notify('Post link copied.');
  } catch { notify('Could not copy the post link.'); }
}

const initials = (name = '?') => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const since = (date) => {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
};

function Avatar({ src, name, size = 'medium', ring = false, onClick }) {
  const contents = src ? <img src={src} alt="" /> : <span>{initials(name)}</span>;
  const className = `avatar avatar-${size}${ring ? ' avatar-ring' : ''}`;
  if (onClick) return <button className={className} onClick={onClick} aria-label={`${name || 'User'}'s profile`} type="button">{contents}</button>;
  return <span className={className} role="img" aria-label={`${name || 'User'}'s profile`}>{contents}</span>;
}

function AuthScreen({ onAuth }) {
  const [signup, setSignup] = useState(false);
  const [values, setValues] = useState({ name: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const change = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const path = signup ? '/auth/register' : '/auth/login';
      const body = signup
        ? values
        : { identifier: values.email, password: values.password };
      const result = await api(path, { method: 'POST', body: JSON.stringify(body) });
      onAuth(result.user);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="brand auth-brand" href="#" aria-label="VYBORA home"><span className="brand-mark">v</span>vybora</a>
        <div className="auth-copy">
          <div className="eyebrow"><span className="live-dot" /> A little closer, every day</div>
          <h1>Your world.<br /><span>Your people.</span></h1>
          <p>Find your people, share your moments, and make the internet feel a little more like home.</p>
        </div>
        <div className="auth-photo" style={{ backgroundImage: `url("${photo('photo-1529156069898-49953e39b3ac', 1400)}")` }}>
          <div className="photo-caption"><div className="avatar-stack"><Avatar size="tiny" name="Mia" src={photo(avatarPhotos[0])} /><Avatar size="tiny" name="Leo" src={photo(avatarPhotos[1])} /><Avatar size="tiny" name="Amara" src={photo(avatarPhotos[2])} /></div><span>Good things happen together.</span><Heart size={16} fill="currentColor" /></div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-welcome"><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h2>{signup ? 'Create your account' : 'Welcome back'}</h2><p>{signup ? 'A good place to find your people.' : 'We saved you a seat.'}</p></div>
          <form onSubmit={submit} className="auth-form">
            {signup && <><label>Your name<input name="name" autoComplete="name" placeholder="How should we call you?" value={values.name} onChange={change} minLength="2" maxLength="60" required /></label><label>Username<input name="username" autoComplete="username" placeholder="yourname" value={values.username} onChange={change} minLength="3" maxLength="24" pattern="[A-Za-z0-9_.]+" required /></label></>}
            <label>{signup ? 'Email address' : 'Email or username'}<input name="email" autoComplete="username" type={signup ? 'email' : 'text'} placeholder={signup ? 'you@example.com' : 'you@example.com or username'} value={values.email} onChange={change} required /></label>
            <label className="password-label">Password<input name="password" autoComplete={signup ? 'new-password' : 'current-password'} type="password" placeholder={signup ? 'At least 10 characters' : 'Enter your password'} value={values.password} onChange={change} minLength={signup ? 10 : 1} required />{signup && <span className="field-note">Use at least 10 characters.</span>}</label>
            {!signup && <div className="auth-options"><span className="muted-link">Password reset will be available in a later release.</span></div>}
            {error && <div className="inline-error" role="alert">{error}</div>}
            <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create my account' : 'Sign in'} <ArrowRight size={17} /></button>
          </form>
          <div className="auth-switch">{signup ? 'Already have a VYBORA account?' : 'New to VYBORA?'} <button onClick={() => { setSignup(!signup); setError(''); }} type="button">{signup ? 'Sign in' : 'Create an account'}</button></div>
          <div className="auth-divider"><span /> a little note <span /></div>
          <p className="auth-legal">This early release stores accounts and uploads locally. Read the README before exposing a deployment to the public.</p>
        </div>
        <span className="auth-footer">© 2025 VYBORA · Your World. Your People.</span>
      </section>
    </main>
  );
}

function Navigation({ page, setPage, user, dark, setDark, logout, openNotifications, mobile = false }) {
  const items = [
    { key: 'home', title: 'Home', Icon: Home },
    { key: 'explore', title: 'Explore', Icon: Compass },
    { key: 'messages', title: 'Messages', Icon: MessageCircle },
    { key: 'notifications', title: 'Notifications', Icon: Bell },
    { key: 'profile', title: 'My profile', Icon: UserRound },
  ];
  return (
    <div className={mobile ? 'mobile-nav' : 'side-nav'}>
      {!mobile && <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage('home'); }}><span className="brand-mark">v</span>vybora<span className="brand-period">.</span></a>}
      {!mobile && <div className="nav-section-label">MENU</div>}
      <nav aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}>
        {items.map(({ key, title, Icon }) => <button key={key} className={`nav-item${page === key ? ' active' : ''}`} onClick={() => key === 'notifications' ? openNotifications() : setPage(key)} type="button"><Icon size={20} strokeWidth={page === key ? 2.4 : 1.8} /><span>{title}</span></button>)}
      </nav>
      {!mobile && <>
        <div className="nav-spacer" />
        <button className="nav-item theme-button" onClick={() => setDark(!dark)} type="button">{dark ? <Sun size={20} /> : <Moon size={20} />}<span>{dark ? 'Light mode' : 'Dark mode'}</span></button>
        <button className="nav-item logout-button" onClick={logout} type="button"><LogOut size={19} /><span>Sign out</span></button>
        <button className="sidebar-profile" onClick={() => setPage('profile')} type="button"><Avatar size="small" name={user.name} src={user.avatarUrl} /><span className="sidebar-profile-copy"><b>{user.name}</b><small>@{user.username}</small></span><MoreHorizontal size={19} /></button>
      </>}
    </div>
  );
}

function Stories({ stories, user, openStory, onAdd }) {
  const inputRef = useRef(null);
  return (
    <section className="stories-card">
      <div className="stories-heading"><div><h2>Stories</h2><span>Little moments, big feelings</span></div></div>
      <div className="story-list" id="story-list">
        <button className="story story-add" onClick={() => inputRef.current?.click()} type="button"><span className="story-add-photo"><Avatar name={user.name} src={user.avatarUrl} size="story" /><i><Plus size={17} /></i></span><span className="story-name">Your story</span><span className="story-subtitle">Add a moment</span></button>
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/*,video/mp4,video/webm" onChange={onAdd} />
        {stories.map((story, index) => <button key={story.id} className="story" type="button" onClick={() => openStory(index)}><span className="story-photo"><Avatar name={story.name} src={story.avatarUrl} size="story" ring /></span><span className="story-name">{story.username === user.username ? 'Your story' : story.name.split(' ')[0]}</span><span className="story-subtitle">{since(story.createdAt)}</span></button>)}
      </div>
    </section>
  );
}

function Composer({ user, onCreate, onUpload }) {
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('public');
  const [media, setMedia] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const mediaInfo = useMediaInfo(media);
  const mediaTooLarge = Boolean(media && media.size > 8 * 1024 * 1024);
  async function submit(event) {
    event.preventDefault();
    if (mediaTooLarge) {
      setError('Media must be 8 MB or smaller.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      let uploaded;
      if (media) uploaded = await onUpload(media);
      await onCreate({ body, ...(uploaded ? { mediaUrl: uploaded.url, mediaType: uploaded.type } : {}), audience });
      setBody('');
      setMedia(null);
      setAudience('public');
      if (inputRef.current) inputRef.current.value = '';
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="composer-card" onSubmit={submit}>
      <div className="composer-top"><Avatar name={user.name} src={user.avatarUrl} /><label className="visually-hidden" htmlFor="post-body">Write a post</label><textarea id="post-body" value={body} onChange={(event) => setBody(event.target.value)} placeholder={`What's on your mind, ${user.name.split(' ')[0]}?`} maxLength="2000" rows="2" /></div>
      {media && <div className={`media-preview${mediaTooLarge ? ' media-preview-error' : ''}`}><span><b>{media.name}</b><small>{mediaInfo ? `${media.type.startsWith('video/') ? 'Video' : 'Image'} · ${mediaInfo.dimensions} · ${mediaInfo.size}` : 'Reading file details…'} · Max 8 MB</small></span><button type="button" onClick={() => { setMedia(null); inputRef.current.value = ''; }} aria-label="Remove attachment"><X size={15} /></button></div>}
      {mediaTooLarge && <p className="upload-hint-error" role="alert">This file is over the 8 MB upload limit. Choose a smaller file.</p>}
      {error && <div className="inline-error composer-error" role="alert">{error}</div>}
      <div className="composer-bottom"><div className="composer-tools"><button type="button" className="tool-button" onClick={() => inputRef.current?.click()}><ImagePlus size={18} /><span>Photo / video · max 8 MB</span></button><input ref={inputRef} className="visually-hidden" type="file" accept="image/*,video/mp4,video/webm" onChange={(event) => { setMedia(event.target.files?.[0] || null); event.target.value = ''; }} /><label className="audience-select"><Globe2 size={15} /><select value={audience} onChange={(event) => setAudience(event.target.value)} aria-label="Post audience"><option value="public">Everyone</option><option value="followers">Followers</option><option value="private">Only me</option></select><ChevronDown size={13} /></label></div><button className="button button-primary share-button" disabled={busy || mediaTooLarge || (!body.trim() && !media)} type="submit">{busy ? 'Sharing…' : 'Share'} {!busy && <ArrowRight size={16} />}</button></div>
    </form>
  );
}

function PostCard({ post, user, onLike, onSave, onComment, onDelete, onProfile, onShare, onOpenPost, hideMedia = false }) {
  const [comments, setComments] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [draft, setDraft] = useState('');
  const [commentError, setCommentError] = useState('');
  const [busy, setBusy] = useState(false);
  async function toggleComments() {
    const show = !showComments;
    setShowComments(show);
    if (show && comments.length === 0) {
      try { setComments((await api(`/posts/${post.id}/comments`)).comments); }
      catch (error) { setCommentError(error.message); }
    }
  }
  async function submitComment(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setCommentError('');
    try {
      const result = await onComment(post.id, draft);
      setComments((current) => [...current, result]);
      setDraft('');
    } catch (error) {
      setCommentError(error.message);
    } finally { setBusy(false); }
  }
  return (
    <article className="post-card">
      <div className="post-header"><Avatar name={post.name} src={post.avatarUrl} onClick={() => onProfile(post.username)} /><div className="post-author"><button type="button" onClick={() => onProfile(post.username)}>{post.name}</button><span>@{post.username} <i>·</i> {since(post.createdAt)}</span></div>{post.userId === user.id && <button className="icon-button post-menu" aria-label="Delete post" type="button" onClick={() => onDelete(post.id)}><MoreHorizontal size={20} /></button>}</div>
      {post.body && <p className="post-text">{post.body.split(/(#[\w]+)/g).map((part, index) => part.startsWith('#') ? <span className="hashtag" key={`${part}-${index}`}>{part}</span> : part)}</p>}
      {!hideMedia && post.mediaUrl && (post.mediaType === 'video'
        ? <div className="post-video-wrap"><video className="post-media" controls playsInline src={post.mediaUrl} /><button className="post-expand" type="button" onClick={() => onOpenPost?.(post)} aria-label="Open video post"><Maximize2 size={16} /></button></div>
        : <button className="post-media-open" type="button" onClick={() => onOpenPost?.(post)} aria-label="Open photo post"><img className="post-media" src={post.mediaUrl} alt="Shared by the community" loading="lazy" /></button>)}
      <div className="post-stats">{post.reactionCount > 0 && <span><span className="reaction-bubble"><Heart size={11} fill="currentColor" /></span> {post.reactionCount} {post.reactionCount === 1 ? 'reaction' : 'reactions'}</span>}<button type="button" onClick={toggleComments}>{post.commentCount} comments</button></div>
      <div className="post-actions"><div className="reaction-actions"><button type="button" className={post.viewerReaction ? 'is-liked' : ''} onClick={() => onLike(post.id, Boolean(post.viewerReaction), 'love')}>{post.viewerReaction ? reactionOptions.find((reaction) => reaction.kind === post.viewerReaction)?.emoji : <Heart size={18} />} <span>{reactionOptions.find((reaction) => reaction.kind === post.viewerReaction)?.label || 'Like'}</span></button><button className="reaction-picker-toggle" type="button" aria-label="Choose a reaction" aria-expanded={showReactionPicker} onClick={() => setShowReactionPicker(!showReactionPicker)}><Smile size={17} /></button>{showReactionPicker && <div className="reaction-picker" role="group" aria-label="Reactions">{reactionOptions.map(({ kind, label, emoji }) => <button key={kind} type="button" aria-label={label} title={label} onClick={() => { onLike(post.id, post.viewerReaction === kind, kind); setShowReactionPicker(false); }}>{emoji}</button>)}</div>}</div><button type="button" onClick={toggleComments}><MessageCircle size={18} /><span>Comment</span></button><button type="button" onClick={() => onShare(post.id)}><Share2 size={18} /><span>Share</span></button>{onOpenPost && <button type="button" onClick={() => onOpenPost(post)}><Maximize2 size={17} /><span>Open</span></button>}<button className={`save-button${post.viewerSaved ? ' is-liked' : ''}`} type="button" title={post.viewerSaved ? 'Remove saved post' : 'Save post'} aria-label={post.viewerSaved ? 'Remove saved post' : 'Save post'} onClick={() => onSave(post.id, Boolean(post.viewerSaved))}><Bookmark size={18} fill={post.viewerSaved ? 'currentColor' : 'none'} /></button></div>
      {showComments && <div className="comments-area"><form className="comment-composer" onSubmit={submitComment}><Avatar name={user.name} src={user.avatarUrl} size="small" /><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a kind comment…" maxLength="1000" aria-label="Write a comment" /><button aria-label="Send comment" disabled={!draft.trim() || busy}><Send size={16} /></button></form>{commentError && <p className="inline-error">{commentError}</p>}{comments.map((comment) => <div className="comment" key={comment.id}><Avatar size="small" name={comment.name} src={comment.avatarUrl} /><div><b>{comment.name}</b><p>{comment.body}</p></div></div>)}</div>}
    </article>
  );
}

function PostDetailModal({ post, user, onClose, ...actions }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return <div className="post-detail-overlay" role="dialog" aria-modal="true" aria-label="Post details" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><button className="post-detail-close icon-button" type="button" onClick={onClose} aria-label="Close post"><X size={21} /></button><div className="post-detail-modal">{post.mediaUrl ? <div className="post-detail-media">{post.mediaType === 'video' ? <video src={post.mediaUrl} controls playsInline autoPlay /> : <img src={post.mediaUrl} alt="Full-size post" />}</div> : <div className="post-detail-text-art"><Heart size={30} /><span>A little moment, shared.</span></div>}<div className="post-detail-content"><PostCard post={post} user={user} {...actions} hideMedia /></div></div></div>;
}

function RightRail({ page, setPage, suggested, onFollow, onProfile, trends, setQuery, query, onSearch }) {
  const [following, setFollowing] = useState({});
  async function follow(id) {
    setFollowing((state) => ({ ...state, [id]: true }));
    try { await onFollow(id); } catch { setFollowing((state) => ({ ...state, [id]: false })); }
  }
  return (
    <aside className="right-rail">
      <div className="search-box"><Search size={18} /><input value={query} onChange={(event) => { if (event.target.value.trim()) setPage('explore'); onSearch(event.target.value); }} placeholder="Search people and posts…" aria-label="Search people and posts" /></div>
      {page === 'home' && <section className="rail-card welcome-card"><div className="welcome-icon"><Heart size={18} fill="currentColor" /></div><div className="welcome-text"><span>A place for your people</span><p>Share a little joy with your corner of the world.</p></div><button type="button" onClick={() => document.querySelector('.composer-card textarea')?.focus()}>Share a moment <ArrowRight size={14} /></button></section>}
      <section className="rail-section"><div className="rail-heading"><h3>People you may like</h3><button type="button" onClick={() => { setPage('explore'); setQuery(''); onSearch(''); }}>See all</button></div><div className="suggestion-list">{suggested.length ? suggested.slice(0, 3).map((person) => <div className="suggestion" key={person.id}><button className="suggestion-main" onClick={() => onProfile(person.username)} type="button"><Avatar name={person.name} src={person.avatarUrl} size="small" /><span><b>{person.name}</b><small>@{person.username}</small></span></button><button className={`follow-mini${following[person.id] ? ' following' : ''}`} type="button" aria-label={`Follow ${person.name}`} onClick={() => follow(person.id)}>{following[person.id] ? <Check size={16} /> : <Plus size={16} />}</button></div>) : <p className="quiet-note">Try searching for someone new.</p>}</div></section>
      {trends.length > 0 && <section className="rail-section trend-section"><div className="rail-heading"><h3>Trending in the feed</h3><span className="eyebrow">THIS WEEK</span></div>{trends.map((trend, index) => <button className="trend" key={trend.tag} type="button" onClick={() => { setPage('explore'); onSearch(`#${trend.tag}`); }}><span>0{index + 1} · THIS WEEK</span><b>#{trend.tag}</b><small>{trend.count} {trend.count === 1 ? 'post' : 'posts'}</small></button>)}</section>}
      <footer className="rail-footer"><p>VYBORA · Early development release.<br />© 2026 · Your World. Your People.</p></footer>
    </aside>
  );
}

function ProfileView({ profile, posts, currentUser, onFollow, onEdit, onMessage, onAvatarUpload, onProfile, onOpenPost, onLike, onSave, onComment, onDelete, onShare, loading }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: profile?.name || '', bio: profile?.bio || '', location: profile?.location || '', isPrivate: Boolean(profile?.isPrivate), avatarUrl: profile?.avatarUrl || '' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const avatarInput = useRef(null);
  const avatarInfo = useMediaInfo(avatarFile);
  const avatarTooLarge = Boolean(avatarFile && avatarFile.size > 8 * 1024 * 1024);
  useEffect(() => {
    setForm({ name: profile?.name || '', bio: profile?.bio || '', location: profile?.location || '', isPrivate: Boolean(profile?.isPrivate), avatarUrl: profile?.avatarUrl || '' });
    setAvatarFile(null);
  }, [profile]);
  if (loading) return <div className="empty-state"><div className="spinner" /><p>Finding that profile…</p></div>;
  if (!profile) return <div className="empty-state"><div className="empty-icon"><UserRound /></div><h2>We couldn't find that profile.</h2><p>They may have changed their username, or the link is a little off.</p></div>;
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const avatarUrl = avatarFile ? (await onAvatarUpload(avatarFile)).url : form.avatarUrl;
      await onEdit({ ...form, avatarUrl });
      setEditing(false);
      setAvatarFile(null);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  }
  function closeEditor() {
    setEditing(false);
    setForm({ name: profile.name, bio: profile.bio || '', location: profile.location || '', isPrivate: Boolean(profile.isPrivate), avatarUrl: profile.avatarUrl || '' });
    setAvatarFile(null);
    setSaveError('');
  }
  return <section className="profile-view"><div className="profile-cover"><div className="cover-sparkle">✳</div><div className="profile-avatar"><Avatar name={profile.name} src={profile.avatarUrl} size="profile" /></div></div><div className="profile-body"><div className="profile-controls">{profile.id === currentUser.id ? <button className="button button-outline" onClick={() => { if (editing) closeEditor(); else { setEditing(true); setSaveError(''); } }} type="button"><PenLine size={15} /> {editing ? 'Cancel editing' : 'Edit profile'}</button> : <><button className="button button-outline" type="button" onClick={() => onMessage(profile)}><MessageCircle size={15} /> Message</button><button className="button button-primary" type="button" onClick={() => onFollow(profile.id, profile.isFollowing)}>{profile.isFollowing ? 'Following' : 'Follow'} {!profile.isFollowing && <Plus size={15} />}</button></>}</div><h1>{profile.name}</h1><p className="profile-handle">@{profile.username}</p>{profile.bio && <p className="profile-bio">{profile.bio}</p>}{profile.location && <p className="profile-location"><Globe2 size={15} /> {profile.location}</p>}<div className="profile-stats"><span><b>{profile.postCount}</b> posts</span><span><b>{profile.followerCount}</b> followers</span><span><b>{profile.followingCount}</b> following</span></div>
  {editing && <form className="edit-profile-form" onSubmit={save}><div className="avatar-edit-row"><Avatar name={profile.name} src={form.avatarUrl} size="large" /><div><b>Profile photo</b><div className="avatar-edit-actions"><button className="text-button" type="button" onClick={() => avatarInput.current?.click()}>Change photo · max 8 MB</button>{form.avatarUrl && <button className="text-button" type="button" onClick={() => { setAvatarFile(null); setForm({ ...form, avatarUrl: '' }); }}>Remove</button>}</div>{avatarFile && <small className="avatar-file-name">{avatarInfo ? `${avatarInfo.dimensions} · ${avatarInfo.size}` : 'Reading image details…'} · {avatarFile.name}</small>}<small className="avatar-hint">Recommended: square photo, 400 × 400 px or higher.</small><input ref={avatarInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { setAvatarFile(event.target.files?.[0] || null); event.target.value = ''; setSaveError(''); }} /></div></div>{avatarTooLarge && <p className="upload-hint-error" role="alert">This image is over the 8 MB upload limit.</p>}<label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength="60" required /></label><label>About you<textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} maxLength="160" /></label><label>Location<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} maxLength="80" /></label><label className="privacy-toggle"><input type="checkbox" checked={form.isPrivate} onChange={(event) => setForm({ ...form, isPrivate: event.target.checked })} /> Private account</label>{saveError && <p className="inline-error" role="alert">{saveError}</p>}<button className="button button-primary" type="submit" disabled={saving || avatarTooLarge}>{saving ? 'Saving…' : 'Save changes'}</button></form>}
  <div className="profile-tabs"><span className="tab-active">Posts</span></div>{profile.isPrivate && !profile.isFollowing && profile.id !== currentUser.id ? <div className="private-profile"><ShieldCheck size={25} /><b>This account is private</b><span>Follow @{profile.username} to see their posts and stories.</span></div> : <div className="profile-posts">{posts.length ? posts.map((post) => <PostCard key={post.id} post={post} user={currentUser} onLike={onLike} onSave={onSave} onComment={onComment} onDelete={onDelete} onShare={onShare} onProfile={onProfile} onOpenPost={onOpenPost} />) : <div className="profile-empty"><Camera size={24} /><b>No posts here yet</b><span>When someone shares, their moments will find a home here.</span></div>}</div>}</div></section>;
}

function MessagesView({ currentUser, suggested, initialTarget }) {
  const [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState(initialTarget);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const refreshThreads = () => api('/messages')
      .then(({ threads: current }) => { if (active) setThreads(current); })
      .catch((issue) => { if (active) setError(issue.message); });
    refreshThreads();
    const timer = window.setInterval(refreshThreads, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setMessages([]);
    setDraft('');
    setError('');
    const path = `/messages/${encodeURIComponent(selected.id)}`;
    const refresh = () => api(path)
      .then(({ peer, messages: current }) => {
        if (active) {
          setSelected(peer);
          setMessages(current);
          const latest = current.at(-1);
          if (latest) {
            setThreads((threadsNow) => [
              { ...peer, lastMessage: latest.body, lastSenderId: latest.senderId, createdAt: latest.createdAt },
              ...threadsNow.filter((thread) => thread.id !== peer.id),
            ]);
          }
        }
      })
      .catch((issue) => { if (active) setError(issue.message); })
      .finally(() => { if (active) setLoading(false); });
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selected?.id]);

  async function sendMessage(event) {
    event.preventDefault();
    if (!draft.trim() || !selected) return;
    setSending(true);
    setError('');
    try {
      const { message } = await api(`/messages/${encodeURIComponent(selected.id)}`, {
        method: 'POST',
        body: JSON.stringify({ body: draft }),
      });
      setMessages((current) => [...current, message]);
      setThreads((current) => [
        { ...selected, lastMessage: message.body, lastSenderId: currentUser.id, createdAt: message.createdAt },
        ...current.filter((thread) => thread.id !== selected.id),
      ]);
      setDraft('');
    } catch (issue) {
      setError(issue.message);
    } finally {
      setSending(false);
    }
  }

  const availablePeople = suggested.filter((person) => person.id !== currentUser.id && !threads.some((thread) => thread.id === person.id));
  return <section className="messages-view"><div className="messages-heading"><span className="eyebrow">A LITTLE CLOSER, EVERY DAY</span><h2>Your messages</h2><p>Private conversations with your people.</p></div><div className="messages-layout"><aside className="messages-sidebar"><h3>Recent chats</h3>{threads.length ? <div className="message-contacts">{threads.map((thread) => <button className={`message-contact${selected?.id === thread.id ? ' selected' : ''}`} key={thread.id} onClick={() => setSelected(thread)} type="button"><Avatar size="small" name={thread.name} src={thread.avatarUrl} /><span><b>{thread.name}</b><small>{thread.lastMessage}</small></span></button>)}</div> : <p className="message-list-empty">Your conversations will show up here.</p>}{availablePeople.length > 0 && <><h3>Start a conversation</h3><div className="message-contacts">{availablePeople.slice(0, 6).map((person) => <button className={`message-contact${selected?.id === person.id ? ' selected' : ''}`} key={person.id} onClick={() => setSelected(person)} type="button"><Avatar size="small" name={person.name} src={person.avatarUrl} /><span><b>{person.name}</b><small>@{person.username}</small></span></button>)}</div></>}</aside><section className="message-panel">{selected ? <><header className="message-peer"><Avatar size="small" name={selected.name} src={selected.avatarUrl} /><div><b>{selected.name}</b><span>@{selected.username}</span></div></header><div className="message-list" aria-live="polite">{loading ? <div className="feed-loading"><span className="spinner" /> Loading messages…</div> : messages.length ? messages.map((message) => <article className={`message-bubble${message.senderId === currentUser.id ? ' sent' : ''}`} key={message.id}><p>{message.body}</p><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></article>) : <div className="message-empty"><MessageCircle size={25} /><b>Say hello to {selected.name.split(' ')[0]}</b><span>Your conversation starts here.</span></div>}</div><form className="message-composer" onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${selected.name.split(' ')[0]}…`} maxLength="2000" aria-label="Write a message" /><button className="button button-primary" type="submit" disabled={sending || !draft.trim()} aria-label="Send message">{sending ? 'Sending…' : <Send size={17} />}</button></form>{error && <p className="inline-error message-error" role="alert">{error}</p>}</> : <div className="message-empty message-welcome"><MessageCircle size={30} /><b>Choose someone to message</b><span>Pick a recent chat or start a conversation from the people list.</span>{error && <p className="inline-error" role="alert">{error}</p>}</div>}</section></div></section>;
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState('home');
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [stories, setStories] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [trends, setTrends] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [profile, setProfile] = useState(null);
  const [profilePosts, setProfilePosts] = useState([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [storyIndex, setStoryIndex] = useState(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [toast, setToast] = useState('');
  const [dark, setDark] = useState(() => localStorage.getItem('vybora-theme') === 'dark');
  const [searchResults, setSearchResults] = useState(null);
  const [messageTarget, setMessageTarget] = useState(null);
  const queryTimer = useRef(null);
  const searchVersion = useRef(0);
  const profileRequestVersion = useRef(0);

  const notify = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('vybora-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    let active = true;
    let loadingTimer;
    const startedAt = Date.now();
    api('/auth/me').then(({ user: current }) => setUser(current)).catch(() => {}).finally(() => {
      const remaining = Math.max(0, 650 - (Date.now() - startedAt));
      loadingTimer = window.setTimeout(() => { if (active) setAuthLoading(false); }, remaining);
    });
    return () => {
      active = false;
      window.clearTimeout(loadingTimer);
    };
  }, []);

  const loadFeed = useCallback(async (cursor = null) => {
    setFeedLoading(true);
    try {
      const result = await api(`/feed?limit=12${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      setPosts((current) => cursor ? [...current, ...result.posts] : result.posts);
      setNextCursor(result.nextCursor);
    } catch (error) { notify(error.message); }
    finally { setFeedLoading(false); }
  }, [notify]);

  const loadStories = useCallback(async () => {
    try {
      const result = await api('/stories');
      const userStories = result.stories.map((story) => ({
        ...story,
        username: story.username,
      }));
      setStories(userStories);
    } catch (error) { notify(error.message); }
  }, [notify]);

  useEffect(() => {
    if (!user) return;
    loadFeed();
    loadStories();
    api('/suggestions').then((result) => setSuggested(result.users)).catch((error) => notify(error.message));
    api('/trends').then((result) => setTrends(result.trends)).catch((error) => notify(error.message));
  }, [user, loadFeed, loadStories, notify]);

  useEffect(() => {
    if (!user) return;
    const sharedPostId = new URL(window.location.href).searchParams.get('post');
    if (!sharedPostId) return;
    api(`/posts/${encodeURIComponent(sharedPostId)}`).then(({ post }) => {
      setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
      setPage('home');
    }).catch((error) => notify(error.message)).finally(() => {
      window.history.replaceState({}, '', window.location.pathname);
    });
  }, [user, notify]);

  const openProfile = useCallback(async (username) => {
    const requestVersion = ++profileRequestVersion.current;
    setPage('profile');
    setProfile(null);
    setProfilePosts([]);
    setProfileLoading(true);
    try {
      const result = await api(`/users/${encodeURIComponent(username)}`);
      const loadedProfile = { ...result.profile, isFollowing: result.isFollowing };
      if (requestVersion !== profileRequestVersion.current) return;
      setProfile(loadedProfile);
      try {
        const feed = await api(`/users/${encodeURIComponent(username)}/posts`);
        if (requestVersion === profileRequestVersion.current) setProfilePosts(feed.posts);
      } catch (issue) {
        if (requestVersion !== profileRequestVersion.current) return;
        if (loadedProfile.isPrivate && !loadedProfile.isFollowing) setProfilePosts([]);
        else throw issue;
      }
    } catch (error) {
      if (requestVersion === profileRequestVersion.current) {
        setProfile(null);
        setProfilePosts([]);
        notify(error.message);
      }
    } finally {
      if (requestVersion === profileRequestVersion.current) setProfileLoading(false);
    }
  }, [notify]);

  async function uploadMedia(file) {
    const data = new FormData();
    data.append('file', file);
    return api('/media', { method: 'POST', body: data });
  }
  async function createPost(payload) {
    const result = await api('/posts', { method: 'POST', body: JSON.stringify(payload) });
    setPosts((current) => [result.post, ...current]);
    notify('Your moment is out in the world.');
  }
  async function toggleLike(postId, liked, kind = 'love') {
    try {
      if (liked) await api(`/posts/${postId}/reaction`, { method: 'DELETE' });
      else await api(`/posts/${postId}/reaction`, { method: 'PUT', body: JSON.stringify({ kind }) });
      const update = (current) => current.map((post) => post.id === postId
        ? { ...post, viewerReaction: liked ? null : kind, reactionCount: Math.max(0, post.reactionCount + (liked ? -1 : post.viewerReaction ? 0 : 1)) }
        : post);
      setPosts(update);
      setProfilePosts(update);
      setSelectedPost((current) => current?.id === postId ? update([current])[0] : current);
    } catch (error) { notify(error.message); }
  }
  async function toggleSave(postId, saved) {
    try {
      await api(`/posts/${postId}/bookmark`, { method: saved ? 'DELETE' : 'PUT' });
      const update = (current) => current.map((post) => post.id === postId ? { ...post, viewerSaved: !saved } : post);
      setPosts(update);
      setProfilePosts(update);
      setSelectedPost((current) => current?.id === postId ? update([current])[0] : current);
    } catch (error) { notify(error.message); }
  }
  async function addComment(postId, body) {
    const { comment } = await api(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    const update = (current) => current.map((post) => post.id === postId ? { ...post, commentCount: post.commentCount + 1 } : post);
    setPosts(update);
    setProfilePosts(update);
    setSelectedPost((current) => current?.id === postId ? update([current])[0] : current);
    return comment;
  }
  async function deletePost(postId) {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    try {
      await api(`/posts/${postId}`, { method: 'DELETE' });
      const remove = (current) => current.filter((post) => post.id !== postId);
      setPosts(remove);
      setProfilePosts(remove);
      setSelectedPost((current) => current?.id === postId ? null : current);
      notify('Post deleted.');
    } catch (error) { notify(error.message); }
  }
  async function follow(id, currentlyFollowing = false) {
    try {
      await api(`/users/${id}/follow`, { method: currentlyFollowing ? 'DELETE' : 'POST' });
      setSuggested((current) => current.filter((person) => person.id !== id));
      const target = profile;
      setProfile((current) => current ? { ...current, isFollowing: !currentlyFollowing, followerCount: current.followerCount + (currentlyFollowing ? -1 : 1) } : current);
      if (target?.id === id && target.isPrivate && !currentlyFollowing) {
        const result = await api(`/users/${encodeURIComponent(target.username)}/posts`);
        setProfilePosts(result.posts);
      } else if (target?.id === id && target.isPrivate && currentlyFollowing) {
        setProfilePosts([]);
      }
    } catch (error) { notify(error.message); }
  }
  async function handleStoryUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadMedia(file);
      await api('/stories', { method: 'POST', body: JSON.stringify({ mediaUrl: uploaded.url, mediaType: uploaded.type }) });
      await loadStories();
      notify('Your story is live for 24 hours.');
    } catch (error) { notify(error.message); }
    event.target.value = '';
  }
  function search(query) {
    setSearchText(query);
    window.clearTimeout(queryTimer.current);
    const version = ++searchVersion.current;
    if (!query.trim()) { setSearchResults(null); return; }
    queryTimer.current = window.setTimeout(() => api(`/search?q=${encodeURIComponent(query)}`)
      .then((result) => { if (version === searchVersion.current) setSearchResults(result); })
      .catch((error) => { if (version === searchVersion.current) notify(error.message); }), 250);
  }
  async function saveProfile(form) {
    try {
      const result = await api('/profile', { method: 'PATCH', body: JSON.stringify(form) });
      setUser(result.user);
      setProfile((current) => ({ ...current, ...result.user }));
      notify('Your profile has been updated.');
    } catch (error) { notify(error.message); throw error; }
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setPosts([]);
    setPage('home');
  }
  async function showNotifications() {
    profileRequestVersion.current += 1;
    setPage('notifications');
    try {
      await api('/notifications/read', { method: 'POST' });
      const result = await api('/notifications');
      setNotifications(result.notifications);
    } catch (error) { notify(error.message); }
  }

  function openMessages(target) {
    setMessageTarget(target || null);
    setPage('messages');
  }
  function navigate(pageName) {
    setMessageTarget(null);
    if (pageName === 'profile' && user) {
      openProfile(user.username);
      return;
    }
    profileRequestVersion.current += 1;
    setPage(pageName);
  }
  const closePost = useCallback(() => setSelectedPost(null), []);

  if (authLoading) return <main className="loading-screen" role="status" aria-live="polite"><div className="loading-glow loading-glow-one" /><div className="loading-glow loading-glow-two" /><div className="loading-card"><div className="loading-mark-wrap"><span className="brand-mark">v</span><i /></div><div className="loading-brand">vybora<span>.</span></div><p>Gathering your little corner of the world</p><div className="loading-track"><i /></div><div className="loading-caption"><span className="live-dot" /> Your world is getting ready</div></div></main>;
  if (!user) return <AuthScreen onAuth={setUser} />;

  const results = searchResults?.users || [];
  const shownPosts = searchText ? [] : posts;
  const detailPost = selectedPost
    ? posts.find((post) => post.id === selectedPost.id) || profilePosts.find((post) => post.id === selectedPost.id) || selectedPost
    : null;
  return (
    <div className="app-shell">
      <aside className="left-sidebar"><Navigation page={page} setPage={navigate} user={user} dark={dark} setDark={setDark} logout={logout} openNotifications={showNotifications} /></aside>
      <div className="main-column">
        <header className="topbar"><div className="topbar-greeting"><span className="eyebrow">A LITTLE CLOSER, EVERY DAY</span><h1>{page === 'home' ? `Good morning, ${user.name.split(' ')[0]}` : page === 'explore' ? 'Find your people' : page === 'notifications' ? 'Your notifications' : page === 'profile' ? 'Your little corner' : page === 'messages' ? 'Your conversations' : 'Your world'}</h1></div><div className="topbar-actions"><button className="icon-button mobile-search-button" onClick={() => navigate('explore')} type="button" aria-label="Search"><Search size={20} /></button><button className="icon-button notification-button" onClick={showNotifications} type="button" aria-label="Notifications"><Bell size={20} />{notifications.some((item) => !item.readAt) && <i />}</button><Avatar name={user.name} src={user.avatarUrl} onClick={() => navigate('profile')} /></div></header>
        <main className={`page-content page-${page}`}>
          {page === 'home' && <>
            <Stories stories={stories} user={user} openStory={setStoryIndex} onAdd={handleStoryUpload} />
            <Composer user={user} onCreate={createPost} onUpload={uploadMedia} />
            <div className="feed-heading"><div><h2>Your feed</h2><span>Good things from your people</span></div><button className="sort-button" type="button" onClick={() => notify('You’re viewing the latest moments.')}>Latest <ArrowDown size={14} /></button></div>
            <div className="feed-list">{shownPosts.map((post) => <PostCard key={post.id} post={post} user={user} onLike={toggleLike} onSave={toggleSave} onComment={addComment} onDelete={deletePost} onProfile={openProfile} onShare={sharePost} onOpenPost={setSelectedPost} />)}{feedLoading && <div className="feed-loading"><span className="spinner" /> Finding your moments…</div>}{!feedLoading && posts.length === 0 && <div className="empty-state"><div className="empty-icon"><Heart /></div><h2>Your feed is a blank canvas.</h2><p>Make the first moment, and let your people fill in the rest.</p><button className="button button-primary" onClick={() => document.querySelector('.composer-card textarea')?.focus()} type="button">Share your first moment <ArrowRight size={16} /></button></div>}{nextCursor && <button className="load-more" onClick={() => loadFeed(nextCursor)} type="button">Find older moments <ArrowDown size={16} /></button>}</div>
          </>}
          {page === 'explore' && <section className="explore-view"><div className="explore-banner"><div className="explore-sparkle">✳</div><span className="eyebrow">A LITTLE INSPIRATION GOES A LONG WAY</span><h2>Somewhere, your people are sharing something lovely.</h2><p>Search a name, username, or hashtag to find a moment.</p><div className="explore-search"><Search size={19} /><input value={searchText} onChange={(event) => search(event.target.value)} placeholder="Try a name, username or #hashtag…" autoFocus /></div></div><h3>{searchText ? 'Search results' : 'People you may like'}</h3><div className="explore-people">{(searchText ? results : suggested).map((person) => <article className="explore-person" key={person.id}><Avatar size="large" name={person.name} src={person.avatarUrl} /><h4>{person.name}</h4><span>@{person.username}</span><p>{person.bio || 'Here for the little moments.'}</p><button className="button button-outline" onClick={() => openProfile(person.username)} type="button">Visit profile <ArrowRight size={15} /></button></article>)}</div>{searchText && searchResults?.posts?.map((post) => <PostCard key={post.id} post={post} user={user} onLike={toggleLike} onSave={toggleSave} onComment={addComment} onDelete={deletePost} onProfile={openProfile} onShare={sharePost} onOpenPost={setSelectedPost} />)}{searchText && !results.length && !searchResults?.posts?.length && <div className="empty-state"><div className="empty-icon"><Search /></div><h2>No matches just yet</h2><p>Try another name, username, or hashtag.</p></div>}{trends.length > 0 && <section className="explore-trends"><h3>Trending in public posts this week</h3><div>{trends.map((trend, index) => <button type="button" key={trend.tag} onClick={() => search(`#${trend.tag}`)}><span>0{index + 1} · {trend.count} {trend.count === 1 ? 'POST' : 'POSTS'}</span><b>#{trend.tag}</b><small>From recent public posts</small></button>)}</div></section>}</section>}
          {page === 'profile' && <ProfileView profile={profile} posts={profilePosts} currentUser={user} onFollow={follow} onEdit={saveProfile} onMessage={openMessages} onAvatarUpload={uploadMedia} onProfile={openProfile} onOpenPost={setSelectedPost} onLike={toggleLike} onSave={toggleSave} onComment={addComment} onDelete={deletePost} onShare={sharePost} loading={profileLoading} />}
          {page === 'messages' && <MessagesView key={messageTarget?.id || 'inbox'} currentUser={user} suggested={suggested} initialTarget={messageTarget} />}
          {page === 'notifications' && <section className="notifications-view"><div className="notifications-intro"><div className="eyebrow">THE GOOD THINGS</div><h2>You're on someone's mind.</h2><p>Every wave, kind word, and new connection finds its way here.</p></div>{notifications.length ? notifications.map((item) => <article className="notification-item" key={item.id}><Avatar size="small" name={item.name} src={item.avatarUrl} /><div><p><b>{item.name}</b> {item.kind === 'follow' ? 'started following you.' : item.kind === 'comment' ? 'left a kind comment on your post.' : item.kind === 'message' ? 'sent you a message.' : 'sent a little love your way.'}</p><span>{since(item.createdAt)} ago · @{item.username}</span>{item.kind === 'message' && <button className="notification-message-link" type="button" onClick={() => openMessages({ id: item.actorId, username: item.username, name: item.name, avatarUrl: item.avatarUrl })}>Open conversation <ArrowRight size={13} /></button>}</div>{!item.readAt && <i className="notification-unread" />}</article>) : <div className="empty-state"><div className="empty-icon"><Bell /></div><h2>It's quiet, in the nicest way.</h2><p>When someone says hello, you'll find it here.</p></div>}</section>}
          {searchText && page === 'home' && <div className="search-overlay"><div className="search-results-heading"><h3>People</h3><button onClick={() => { setSearchText(''); setSearchResults(null); }} aria-label="Clear search" type="button"><X size={17} /></button></div>{results.length ? results.map((person) => <button key={person.id} type="button" className="search-result" onClick={() => { setSearchText(''); openProfile(person.username); }}><Avatar size="small" name={person.name} src={person.avatarUrl} /><span><b>{person.name}</b><small>@{person.username}</small></span></button>) : <p>No people found.</p>}{searchResults?.posts?.length > 0 && <><div className="search-results-heading"><h3>Posts</h3></div>{searchResults.posts.slice(0, 3).map((post) => <button key={post.id} type="button" className="search-result" onClick={() => setPage('explore')}><span><b>{post.name}</b><small>{post.body.slice(0, 75)}</small></span></button>)}</>}</div>}
        </main>
      </div>
      <RightRail page={page} setPage={setPage} suggested={suggested} onFollow={(id) => follow(id)} onProfile={openProfile} trends={trends} setQuery={search} query={searchText} onSearch={search} />
      <div className="mobile-bottom"><Navigation page={page} setPage={navigate} user={user} dark={dark} setDark={setDark} logout={logout} openNotifications={showNotifications} mobile /></div>
      {storyIndex !== null && stories[storyIndex] && <div className="story-modal" role="dialog" aria-modal="true" aria-label="Story viewer"><button className="story-close icon-button" onClick={() => setStoryIndex(null)} aria-label="Close story"><X /></button>{storyIndex > 0 && <button className="story-prev icon-button" onClick={() => setStoryIndex(storyIndex - 1)} aria-label="Previous story"><ArrowLeft /></button>}<div className="story-viewer">{stories[storyIndex].mediaType === 'video' ? <video src={stories[storyIndex].mediaUrl} aria-label={`${stories[storyIndex].name}'s story`} autoPlay controls playsInline /> : <img src={stories[storyIndex].mediaUrl} alt={`${stories[storyIndex].name}'s story`} />}<div className="story-viewer-caption"><Avatar size="small" name={stories[storyIndex].name} src={stories[storyIndex].avatarUrl} /><b>{stories[storyIndex].name}</b><span>{since(stories[storyIndex].createdAt)}</span></div></div>{storyIndex < stories.length - 1 && <button className="story-next icon-button" onClick={() => setStoryIndex(storyIndex + 1)} aria-label="Next story"><ArrowRight /></button>}</div>}
      {detailPost && <PostDetailModal key={detailPost.id} post={detailPost} user={user} onClose={closePost} onLike={toggleLike} onSave={toggleSave} onComment={addComment} onDelete={deletePost} onProfile={openProfile} onShare={sharePost} />}
      {toast && <div className="toast" role="status"><Check size={16} /> {toast}</div>}
    </div>
  );
}

export default App;
