import React, { useState, useEffect, useCallback, useMemo, useRef, useReducer, useContext, createContext } from 'react';

// Type Definitions
interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'admin' | 'user' | 'guest';
  preferences: UserPreferences;
}

interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: boolean;
  emailUpdates: boolean;
  privacy: 'public' | 'private' | 'friends';
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  images: string[];
  rating: number;
  reviews: Review[];
  stock: number;
  tags: string[];
  specifications: Record<string, string>;
  variants: ProductVariant[];
}

interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: Date;
  helpful: number;
}

interface ProductVariant {
  id: string;
  name: string;
  price: number;
  stock: number;
  attributes: Record<string, string>;
}

interface CartItem {
  product: Product;
  quantity: number;
  selectedVariant?: ProductVariant;
}

interface Order {
  id: string;
  userId: string;
  items: CartItem[];
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: Date;
  shippingAddress: Address;
  paymentMethod: PaymentMethod;
}

interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

interface PaymentMethod {
  type: 'credit_card' | 'debit_card' | 'paypal' | 'bank_transfer';
  lastFour?: string;
  expiryDate?: string;
}

// Context
interface AppContextType {
  user: User | null;
  cart: CartItem[];
  orders: Order[];
  products: Product[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  createOrder: (order: Omit<Order, 'id' | 'createdAt'>) => void;
  setUser: (user: User | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Reducer
type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { productId: string; quantity: number } }
  | { type: 'CLEAR_CART' };

interface CartState {
  items: CartItem[];
  total: number;
}

const cartReducer = (state: CartState, action: CartAction): CartState => {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existingItemIndex = state.items.findIndex(
        item => item.product.id === action.payload.product.id
      );

      if (existingItemIndex >= 0) {
        const updatedItems = [...state.items];
        updatedItems[existingItemIndex] = {
          ...updatedItems[existingItemIndex],
          quantity: updatedItems[existingItemIndex].quantity + action.payload.quantity
        };
        return {
          ...state,
          items: updatedItems,
          total: calculateCartTotal(updatedItems)
        };
      }

      const newItems = [...state.items, action.payload];
      return {
        ...state,
        items: newItems,
        total: calculateCartTotal(newItems)
      };
    }

    case 'REMOVE_ITEM': {
      const newItems = state.items.filter(item => item.product.id !== action.payload);
      return {
        ...state,
        items: newItems,
        total: calculateCartTotal(newItems)
      };
    }

    case 'UPDATE_QUANTITY': {
      const newItems = state.items.map(item =>
        item.product.id === action.payload.productId
          ? { ...item, quantity: action.payload.quantity }
          : item
      ).filter(item => item.quantity > 0);

      return {
        ...state,
        items: newItems,
        total: calculateCartTotal(newItems)
      };
    }

    case 'CLEAR_CART':
      return {
        items: [],
        total: 0
      };

    default:
      return state;
  }
};

const calculateCartTotal = (items: CartItem[]): number => {
  return items.reduce((total, item) => {
    const price = item.selectedVariant ? item.selectedVariant.price : item.product.price;
    return total + (price * item.quantity);
  }, 0);
};

// Custom Hooks
const useLocalStorage = <T,>(key: string, initialValue: T) => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error loading ${key} from localStorage:`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error saving ${key} to localStorage:`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue] as const;
};

const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

const usePrevious = <T,>(value: T): T | undefined => {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

// Utility Functions
const formatPrice = (price: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(price);
};

const formatDate = (date: Date, locale: string = 'en-US'): string => {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
};

const calculateAverageRating = (reviews: Review[]): number => {
  if (reviews.length === 0) return 0;
  const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
};

// Components

// Header Component
const Header: React.FC = () => {
  const { user, cart } = useContext(AppContext)!;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const cartItemCount = useMemo(() => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  }, [cart]);

  const handleSearch = useCallback((query: string) => {
    // Search logic would go here
    console.log('Searching for:', query);
  }, []);

  useEffect(() => {
    if (debouncedSearchQuery) {
      handleSearch(debouncedSearchQuery);
    }
  }, [debouncedSearchQuery, handleSearch]);

  return (
    <header className="header">
      <div className="header-container">
        <div className="header-left">
          <h1 className="logo">E-Commerce Store</h1>
          <nav className={`nav ${isMenuOpen ? 'nav--open' : ''}`}>
            <ul className="nav-list">
              <li><a href="/">Home</a></li>
              <li><a href="/products">Products</a></li>
              <li><a href="/categories">Categories</a></li>
              <li><a href="/about">About</a></li>
            </ul>
          </nav>
        </div>

        <div className="header-center">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <button className="search-button" aria-label="Search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
            </button>
          </div>
        </div>

        <div className="header-right">
          <button className="cart-button" aria-label={`Cart (${cartItemCount} items)`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
            {cartItemCount > 0 && (
              <span className="cart-badge">{cartItemCount}</span>
            )}
          </button>

          {user ? (
            <div className="user-menu">
              <img src={user.avatar} alt={user.name} className="user-avatar" />
              <span className="user-name">{user.name}</span>
            </div>
          ) : (
            <button className="login-button">Sign In</button>
          )}

          <button
            className="menu-toggle"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};

// Product Card Component
const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const { addToCart } = useContext(AppContext)!;
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(
    product.variants[0]
  );
  const [quantity, setQuantity] = useState(1);
  const [showDetails, setShowDetails] = useState(false);

  const averageRating = useMemo(
    () => calculateAverageRating(product.reviews),
    [product.reviews]
  );

  const displayedPrice = selectedVariant ? selectedVariant.price : product.price;
  const displayedStock = selectedVariant ? selectedVariant.stock : product.stock;

  const handleAddToCart = useCallback(() => {
    addToCart({
      product,
      quantity,
      selectedVariant
    });
  }, [addToCart, product, quantity, selectedVariant]);

  return (
    <div className="product-card">
      <div className="product-image-container">
        <img
          src={product.images[0]}
          alt={product.name}
          className="product-image"
          loading="lazy"
        />
        {product.rating >= 4.5 && (
          <span className="product-badge">Best Seller</span>
        )}
      </div>

      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>
        <p className="product-category">{product.category}</p>

        <div className="product-rating">
          <div className="stars">
            {[1, 2, 3, 4, 5].map(star => (
              <span
                key={star}
                className={`star ${star <= averageRating ? 'star--filled' : ''}`}
              >
                ★
              </span>
            ))}
          </div>
          <span className="rating-value">{averageRating}</span>
          <span className="review-count">({product.reviews.length} reviews)</span>
        </div>

        <div className="product-price">
          <span className="price-current">{formatPrice(displayedPrice)}</span>
          {selectedVariant && selectedVariant.price !== product.price && (
            <span className="price-original">{formatPrice(product.price)}</span>
          )}
        </div>

        {product.variants.length > 1 && (
          <div className="product-variants">
            <label className="variant-label">Variant:</label>
            <select
              value={selectedVariant?.id || ''}
              onChange={(e) => {
                const variant = product.variants.find(v => v.id === e.target.value);
                setSelectedVariant(variant);
              }}
              className="variant-select"
            >
              {product.variants.map(variant => (
                <option key={variant.id} value={variant.id}>
                  {variant.name} - {formatPrice(variant.price)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="product-stock">
          <span className={`stock-status ${displayedStock > 0 ? 'stock-status--available' : 'stock-status--out'}`}>
            {displayedStock > 0 ? `${displayedStock} in stock` : 'Out of stock'}
          </span>
        </div>

        <div className="product-actions">
          <div className="quantity-selector">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              className="quantity-button"
              aria-label="Decrease quantity"
            >
              -
            </button>
            <input
              type="number"
              min="1"
              max={displayedStock}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(displayedStock, parseInt(e.target.value) || 1)))}
              className="quantity-input"
            />
            <button
              onClick={() => setQuantity(Math.min(displayedStock, quantity + 1))}
              disabled={quantity >= displayedStock}
              className="quantity-button"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={displayedStock === 0}
            className="add-to-cart-button"
          >
            Add to Cart
          </button>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="details-toggle"
            aria-expanded={showDetails}
          >
            {showDetails ? 'Less' : 'More'} Details
          </button>
        </div>

        {showDetails && (
          <div className="product-details">
            <p className="product-description">{product.description}</p>

            {product.tags.length > 0 && (
              <div className="product-tags">
                {product.tags.map(tag => (
                  <span key={tag} className="tag">#{tag}</span>
                ))}
              </div>
            )}

            {Object.keys(product.specifications).length > 0 && (
              <div className="product-specifications">
                <h4>Specifications</h4>
                <dl className="specifications-list">
                  {Object.entries(product.specifications).map(([key, value]) => (
                    <React.Fragment key={key}>
                      <dt>{key}:</dt>
                      <dd>{value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>
            )}

            {product.reviews.length > 0 && (
              <div className="product-reviews">
                <h4>Recent Reviews</h4>
                {product.reviews.slice(0, 3).map(review => (
                  <div key={review.id} className="review-item">
                    <div className="review-header">
                      <span className="review-author">{review.userName}</span>
                      <span className="review-date">{formatDate(review.createdAt)}</span>
                    </div>
                    <div className="review-rating">
                      {[1, 2, 3, 4, 5].map(star => (
                        <span
                          key={star}
                          className={`star ${star <= review.rating ? 'star--filled' : ''}`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    <p className="review-comment">{review.comment}</p>
                    <div className="review-helpful">
                      <span>{review.helpful} people found this helpful</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Cart Component
const Cart: React.FC = () => {
  const { cart, removeFromCart, updateCartQuantity, clearCart } = useContext(AppContext)!;
  const [isCheckout, setIsCheckout] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<Address>({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: ''
  });

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => {
      const price = item.selectedVariant ? item.selectedVariant.price : item.product.price;
      return total + (price * item.quantity);
    }, 0);
  }, [cart]);

  const handleQuantityChange = useCallback((productId: string, quantity: number) => {
    updateCartQuantity(productId, quantity);
  }, [updateCartQuantity]);

  const handleRemoveItem = useCallback((productId: string) => {
    removeFromCart(productId);
  }, [removeFromCart]);

  const handleClearCart = useCallback(() => {
    clearCart();
  }, [clearCart]);

  const handleCheckout = useCallback(() => {
    setIsCheckout(true);
  }, []);

  if (cart.length === 0) {
    return (
      <div className="cart-empty">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <path d="M16 10a4 4 0 0 1-8 0"></path>
        </svg>
        <h2>Your cart is empty</h2>
        <p>Start shopping to add items to your cart</p>
      </div>
    );
  }

  return (
    <div className="cart">
      <div className="cart-header">
        <h2>Shopping Cart ({cart.length} items)</h2>
        <button onClick={handleClearCart} className="clear-cart-button">
          Clear Cart
        </button>
      </div>

      <div className="cart-items">
        {cart.map(item => {
          const price = item.selectedVariant ? item.selectedVariant.price : item.product.price;
          const subtotal = price * item.quantity;

          return (
            <div key={item.product.id} className="cart-item">
              <div className="cart-item-image">
                <img src={item.product.images[0]} alt={item.product.name} />
              </div>

              <div className="cart-item-details">
                <h3>{item.product.name}</h3>
                {item.selectedVariant && (
                  <p className="cart-item-variant">{item.selectedVariant.name}</p>
                )}
                <p className="cart-item-price">{formatPrice(price)}</p>
              </div>

              <div className="cart-item-quantity">
                <button
                  onClick={() => handleQuantityChange(item.product.id, item.quantity - 1)}
                  disabled={item.quantity <= 1}
                  className="quantity-button"
                >
                  -
                </button>
                <span className="quantity-display">{item.quantity}</span>
                <button
                  onClick={() => handleQuantityChange(item.product.id, item.quantity + 1)}
                  className="quantity-button"
                >
                  +
                </button>
              </div>

              <div className="cart-item-subtotal">
                <span>{formatPrice(subtotal)}</span>
              </div>

              <div className="cart-item-remove">
                <button
                  onClick={() => handleRemoveItem(item.product.id)}
                  className="remove-button"
                  aria-label="Remove item"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cart-summary">
        <div className="summary-row">
          <span>Subtotal</span>
          <span>{formatPrice(cartTotal)}</span>
        </div>
        <div className="summary-row">
          <span>Shipping</span>
          <span>{formatPrice(cartTotal > 100 ? 0 : 9.99)}</span>
        </div>
        <div className="summary-row">
          <span>Tax (10%)</span>
          <span>{formatPrice(cartTotal * 0.1)}</span>
        </div>
        <div className="summary-row summary-row--total">
          <span>Total</span>
          <span>{formatPrice(cartTotal * 1.1 + (cartTotal > 100 ? 0 : 9.99))}</span>
        </div>

        <button
          onClick={handleCheckout}
          className="checkout-button"
        >
          Proceed to Checkout
        </button>
      </div>

      {isCheckout && (
        <div className="checkout-form">
          <h3>Shipping Information</h3>
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="form-group">
              <label htmlFor="street">Street Address</label>
              <input
                type="text"
                id="street"
                value={shippingAddress.street}
                onChange={(e) => setShippingAddress({ ...shippingAddress, street: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="city">City</label>
              <input
                type="text"
                id="city"
                value={shippingAddress.city}
                onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                required
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="state">State</label>
                <input
                  type="text"
                  id="state"
                  value={shippingAddress.state}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="zipCode">ZIP Code</label>
                <input
                  type="text"
                  id="zipCode"
                  value={shippingAddress.zipCode}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, zipCode: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="country">Country</label>
              <input
                type="text"
                id="country"
                value={shippingAddress.country}
                onChange={(e) => setShippingAddress({ ...shippingAddress, country: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="place-order-button">
              Place Order
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

// User Profile Component
const UserProfile: React.FC = () => {
  const { user, setUser } = useContext(AppContext)!;
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState<User | null>(user);

  useEffect(() => {
    setEditedUser(user);
  }, [user]);

  const handleSave = useCallback(() => {
    if (editedUser) {
      setUser(editedUser);
      setIsEditing(false);
    }
  }, [editedUser, setUser]);

  const handleCancel = useCallback(() => {
    setEditedUser(user);
    setIsEditing(false);
  }, [user]);

  if (!user) {
    return <div>Please sign in to view your profile</div>;
  }

  return (
    <div className="user-profile">
      <div className="profile-header">
        <img src={user.avatar} alt={user.name} className="profile-avatar" />
        <div className="profile-info">
          <h2>{user.name}</h2>
          <p className="profile-email">{user.email}</p>
          <span className={`profile-role role--${user.role}`}>{user.role}</span>
        </div>
        {!isEditing ? (
          <button onClick={() => setIsEditing(true)} className="edit-profile-button">
            Edit Profile
          </button>
        ) : (
          <div className="edit-actions">
            <button onClick={handleSave} className="save-button">Save</button>
            <button onClick={handleCancel} className="cancel-button">Cancel</button>
          </div>
        )}
      </div>

      {isEditing && editedUser ? (
        <div className="profile-edit-form">
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              value={editedUser.name}
              onChange={(e) => setEditedUser({ ...editedUser, name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={editedUser.email}
              onChange={(e) => setEditedUser({ ...editedUser, email: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="avatar">Avatar URL</label>
            <input
              type="url"
              id="avatar"
              value={editedUser.avatar}
              onChange={(e) => setEditedUser({ ...editedUser, avatar: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <div className="profile-details">
          <div className="preferences-section">
            <h3>Preferences</h3>
            <div className="preference-item">
              <span>Theme:</span>
              <span className="preference-value">{user.preferences.theme}</span>
            </div>
            <div className="preference-item">
              <span>Language:</span>
              <span className="preference-value">{user.preferences.language}</span>
            </div>
            <div className="preference-item">
              <span>Notifications:</span>
              <span className={`preference-value ${user.preferences.notifications ? 'enabled' : 'disabled'}`}>
                {user.preferences.notifications ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="preference-item">
              <span>Email Updates:</span>
              <span className={`preference-value ${user.preferences.emailUpdates ? 'enabled' : 'disabled'}`}>
                {user.preferences.emailUpdates ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="preference-item">
              <span>Privacy:</span>
              <span className="preference-value">{user.preferences.privacy}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Product List Component
const ProductList: React.FC = () => {
  const { products } = useContext(AppContext)!;
  const [filter, setFilter] = useState<string>('all');
  const [sort, setSort] = useState<'name' | 'price-asc' | 'price-desc' | 'rating'>('name');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category));
    return ['all', ...Array.from(cats)];
  }, [products]);

  const filteredAndSortedProducts = useMemo(() => {
    let result = [...products];

    // Filter by category
    if (filter !== 'all') {
      result = result.filter(p => p.category === filter);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Sort
    switch (sort) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'price-asc':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        result.sort((a, b) => {
          const ratingA = calculateAverageRating(a.reviews);
          const ratingB = calculateAverageRating(b.reviews);
          return ratingB - ratingA;
        });
        break;
    }

    return result;
  }, [products, filter, sort, searchQuery]);

  return (
    <div className="product-list">
      <div className="product-list-controls">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-controls">
          <div className="filter-group">
            <label htmlFor="category-filter">Category:</label>
            <select
              id="category-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="filter-select"
            >
              {categories.map(category => (
                <option key={category} value={category}>
                  {category === 'all' ? 'All Categories' : category}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="sort-select">Sort by:</label>
            <select
              id="sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="filter-select"
            >
              <option value="name">Name</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="rating">Rating</option>
            </select>
          </div>
        </div>
      </div>

      <div className="products-grid">
        {filteredAndSortedProducts.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {filteredAndSortedProducts.length === 0 && (
        <div className="no-products">
          <p>No products found matching your criteria.</p>
        </div>
      )}
    </div>
  );
};

// Main App Component
const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [cartState, dispatch] = useReducer(cartReducer, { items: [], total: 0 });
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentView, setCurrentView] = useState<'home' | 'products' | 'cart' | 'profile'>('home');

  // Sample data
  const products: Product[] = useMemo(() => [
    {
      id: '1',
      name: 'Premium Wireless Headphones',
      description: 'High-quality wireless headphones with noise cancellation, 30-hour battery life, and premium sound quality. Perfect for music lovers and professionals alike.',
      price: 299.99,
      category: 'Electronics',
      images: ['https://example.com/headphones.jpg'],
      rating: 4.8,
      reviews: [
        {
          id: 'r1',
          userId: 'u1',
          userName: 'John Doe',
          rating: 5,
          comment: 'Amazing sound quality! The noise cancellation is incredible.',
          createdAt: new Date('2024-01-15'),
          helpful: 42
        },
        {
          id: 'r2',
          userId: 'u2',
          userName: 'Jane Smith',
          rating: 4,
          comment: 'Great headphones, but could be more comfortable for long sessions.',
          createdAt: new Date('2024-01-20'),
          helpful: 18
        }
      ],
      stock: 50,
      tags: ['wireless', 'noise-cancelling', 'bluetooth', 'premium'],
      specifications: {
        'Battery Life': '30 hours',
        'Connectivity': 'Bluetooth 5.0',
        'Weight': '250g',
        'Frequency Response': '20Hz - 20kHz'
      },
      variants: [
        {
          id: 'v1',
          name: 'Black',
          price: 299.99,
          stock: 30,
          attributes: { color: 'black' }
        },
        {
          id: 'v2',
          name: 'White',
          price: 299.99,
          stock: 20,
          attributes: { color: 'white' }
        }
      ]
    },
    {
      id: '2',
      name: 'Smart Fitness Watch',
      description: 'Track your health and fitness with this advanced smartwatch. Features heart rate monitoring, GPS tracking, and 7-day battery life.',
      price: 199.99,
      category: 'Electronics',
      images: ['https://example.com/watch.jpg'],
      rating: 4.5,
      reviews: [
        {
          id: 'r3',
          userId: 'u3',
          userName: 'Mike Johnson',
          rating: 5,
          comment: 'Perfect for tracking my workouts. Battery life is impressive!',
          createdAt: new Date('2024-02-01'),
          helpful: 35
        }
      ],
      stock: 75,
      tags: ['fitness', 'smartwatch', 'health', 'gps'],
      specifications: {
        'Battery Life': '7 days',
        'Water Resistance': '5ATM',
        'Display': '1.4 inch AMOLED',
        'Sensors': 'Heart rate, SpO2, GPS'
      },
      variants: [
        {
          id: 'v3',
          name: '42mm',
          price: 199.99,
          stock: 40,
          attributes: { size: '42mm' }
        },
        {
          id: 'v4',
          name: '46mm',
          price: 219.99,
          stock: 35,
          attributes: { size: '46mm' }
        }
      ]
    },
    {
      id: '3',
      name: 'Ergonomic Office Chair',
      description: 'Premium ergonomic office chair with adjustable lumbar support, breathable mesh back, and 4D armrests. Designed for comfort during long work sessions.',
      price: 449.99,
      category: 'Furniture',
      images: ['https://example.com/chair.jpg'],
      rating: 4.7,
      reviews: [],
      stock: 25,
      tags: ['office', 'ergonomic', 'chair', 'comfortable'],
      specifications: {
        'Material': 'Mesh + Aluminum',
        'Weight Capacity': '300 lbs',
        'Adjustment': 'Height, tilt, armrests',
        'Warranty': '5 years'
      },
      variants: []
    }
  ], []);

  const contextValue: AppContextType = useMemo(() => ({
    user,
    cart: cartState.items,
    orders,
    products,
    addToCart: (item) => dispatch({ type: 'ADD_ITEM', payload: item }),
    removeFromCart: (productId) => dispatch({ type: 'REMOVE_ITEM', payload: productId }),
    updateCartQuantity: (productId, quantity) => dispatch({
      type: 'UPDATE_QUANTITY',
      payload: { productId, quantity }
    }),
    clearCart: () => dispatch({ type: 'CLEAR_CART' }),
    createOrder: (order) => {
      const newOrder: Order = {
        ...order,
        id: `order-${Date.now()}`,
        createdAt: new Date()
      };
      setOrders(prev => [...prev, newOrder]);
      dispatch({ type: 'CLEAR_CART' });
    },
    setUser
  }), [user, cartState, orders, products, setUser]);

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return (
          <div className="home-view">
            <section className="hero">
              <h2>Welcome to Our Store</h2>
              <p>Discover amazing products at great prices</p>
            </section>
            <section className="featured-products">
              <h3>Featured Products</h3>
              <div className="products-grid">
                {products.slice(0, 3).map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          </div>
        );
      case 'products':
        return <ProductList />;
      case 'cart':
        return <Cart />;
      case 'profile':
        return <UserProfile />;
      default:
        return <div>View not found</div>;
    }
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="app">
        <Header />
        <main className="main-content">
          <nav className="view-nav">
            <button
              onClick={() => setCurrentView('home')}
              className={`nav-link ${currentView === 'home' ? 'active' : ''}`}
            >
              Home
            </button>
            <button
              onClick={() => setCurrentView('products')}
              className={`nav-link ${currentView === 'products' ? 'active' : ''}`}
            >
              Products
            </button>
            <button
              onClick={() => setCurrentView('cart')}
              className={`nav-link ${currentView === 'cart' ? 'active' : ''}`}
            >
              Cart ({cartState.items.length})
            </button>
            <button
              onClick={() => setCurrentView('profile')}
              className={`nav-link ${currentView === 'profile' ? 'active' : ''}`}
            >
              Profile
            </button>
          </nav>
          {renderView()}
        </main>
        <footer className="footer">
          <p>&copy; 2024 E-Commerce Store. All rights reserved.</p>
        </footer>
      </div>
    </AppContext.Provider>
  );
};

export default App;
