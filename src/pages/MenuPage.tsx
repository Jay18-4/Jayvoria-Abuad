import React, { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, ArrowDown, RotateCcw } from 'lucide-react';
import { apiRequest } from '../services/api';
import type { Category, MenuItem } from '../types';
import { DishCard } from '../components/DishCard';
import { DishDetailModal } from '../components/DishDetailModal';
import { useCart } from '../context/CartContext';

const DIETARY_FILTERS = ['All', "Chef's Selection", 'Vegetarian', 'Vegan', 'Gluten-Free', 'Spicy'] as const;

export function MenuPage() {
  const { syncMenuItems } = useCart();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDietary, setSelectedDietary] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [activeDish, setActiveDish] = useState<MenuItem | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [catRes, menuRes] = await Promise.all([
        apiRequest<{ categories: Category[] }>('/api/categories'),
        apiRequest<{ items: MenuItem[] }>('/api/menu'),
      ]);
      setCategories(catRes.categories);
      setItems(menuRes.items);
      syncMenuItems(menuRes.items);
    } catch (err: any) {
      setError(err.message || 'Unable to load the menu right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedCategory !== 'all' && item.categorySlug !== selectedCategory) return false;
      if (availableOnly && !item.isAvailable) return false;
      if (selectedDietary !== 'All' && !item.dietaryTags.includes(selectedDietary)) return false;
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.description.toLowerCase().includes(q) &&
        !item.categoryName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [items, selectedCategory, selectedDietary, availableOnly, searchQuery]);

  const scrollToMenu = () => {
    document.getElementById('menu-catalogue')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="pb-24">
      {/* Editorial Hero Split */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-white border border-[#EAE5DC] rounded-xl overflow-hidden shadow-card-rest">
          <div className="lg:col-span-6 p-8 sm:p-12 flex flex-col justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#E05A36]">
                Seasonal Tasting & Hearth Kitchen
              </p>
              <h1 className="mt-3 font-editorial text-4xl sm:text-5xl font-semibold text-[#0F172A] leading-[1.12] tracking-tight text-balance">
                Artisanal plates, crafted for your table.
              </h1>
              <p className="mt-4 text-base text-[#475569] leading-relaxed max-w-xl">
                Order Savoria’s wood-fired mains, hand-rolled pastas, and botanical aperitifs for courier delivery or host-stand collection.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                onClick={scrollToMenu}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#E05A36] hover:bg-[#C84624] text-white text-sm font-semibold transition-colors"
              >
                <span>Explore Tonight’s Menu</span>
                <ArrowDown className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-[#64748B]">
                Complimentary delivery over $85 · Freshly prepared to order
              </span>
            </div>
          </div>

          <div className="lg:col-span-6 min-h-[260px] lg:min-h-[380px] relative bg-[#F5F2EB]">
            <img
              src="/src/assets/images/hero_savoria_dining_1794832273901.jpg"
              alt="Savoria dining table spread with artisan sourdough, saffron seafood, and candlelight"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Menu Catalogue Controls */}
      <section id="menu-catalogue" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="font-editorial text-3xl font-semibold text-[#0F172A]">
              Curated Menu
            </h2>
            <p className="text-sm text-[#64748B] mt-1">
              Select dishes below to build your order. Unavailable seasonal items are marked clearly.
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <label htmlFor="menu-search" className="sr-only">
              Search dishes
            </label>
            <input
              id="menu-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes, ingredients..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm text-[#0F172A] placeholder:text-[#94A3B8] input-focus-glow transition-shadow"
            />
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div
          className="flex items-center gap-2 overflow-x-auto pb-2"
          role="tablist"
          aria-label="Menu categories"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 transition-colors border ${
              selectedCategory === 'all'
                ? 'bg-[#0F172A] text-white border-[#0F172A]'
                : 'bg-white text-[#1E293B] border-[#EAE5DC] hover:bg-[#F5F2EB]'
            }`}
          >
            All Courses
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat.slug}
              onClick={() => setSelectedCategory(cat.slug)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 transition-colors border ${
                selectedCategory === cat.slug
                  ? 'bg-[#0F172A] text-white border-[#0F172A]'
                  : 'bg-white text-[#1E293B] border-[#EAE5DC] hover:bg-[#F5F2EB]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Dietary Filters + Availability Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-3 px-4 rounded-xl bg-[#F5F2EB] border border-[#EAE5DC]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] mr-1">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Dietary:
            </span>
            {DIETARY_FILTERS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedDietary(tag)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                  selectedDietary === tag
                    ? 'bg-[#E05A36] text-white'
                    : 'bg-white text-[#1E293B] border border-[#EAE5DC] hover:bg-[#FAF8F5]'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#1E293B] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => setAvailableOnly(e.target.checked)}
              className="w-4 h-4 accent-[#E05A36] rounded"
            />
            <span>Available dishes only</span>
          </label>
        </div>

        {/* Menu Grid States */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white border border-[#EAE5DC] rounded-xl overflow-hidden animate-pulse"
              >
                <div className="aspect-[4/3] bg-[#F5F2EB]" />
                <div className="p-5 space-y-3">
                  <div className="h-3 w-24 bg-[#F5F2EB] rounded" />
                  <div className="h-5 w-3/4 bg-[#F5F2EB] rounded" />
                  <div className="h-4 w-full bg-[#F5F2EB] rounded" />
                  <div className="h-8 w-full bg-[#F5F2EB] rounded pt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-white border border-[#FECACA] rounded-xl p-8 text-center">
            <p className="text-base font-semibold text-[#991B1B]">{error}</p>
            <button
              type="button"
              onClick={loadData}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#E05A36] text-white text-sm font-semibold"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retry</span>
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white border border-[#EAE5DC] rounded-xl p-12 text-center">
            <h3 className="font-editorial text-2xl font-semibold text-[#0F172A]">
              No matching dishes found
            </h3>
            <p className="mt-2 text-sm text-[#64748B]">
              Try clearing your search query or switching course and dietary filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setSelectedDietary('All');
                setSearchQuery('');
                setAvailableOnly(false);
              }}
              className="mt-5 px-5 py-2.5 rounded-full bg-[#0F172A] text-white text-sm font-semibold"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <DishCard key={item.id} item={item} onSelect={setActiveDish} />
            ))}
          </div>
        )}
      </section>

      <DishDetailModal item={activeDish} onClose={() => setActiveDish(null)} />
    </div>
  );
}
