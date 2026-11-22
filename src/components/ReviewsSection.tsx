import { useMemo, useState } from 'react';
import { Check, MessageSquarePlus, Star, X } from 'lucide-react';
import type { ReviewItem } from '../types/store';
import { submitReviewApi } from '../utils/api';

interface ReviewsSectionProps {
  reviews: ReviewItem[];
  onReviewSubmitted?: () => void;
}

export function ReviewsSection({ reviews, onReviewSubmitted }: ReviewsSectionProps) {
  const [visibleDesktopCount, setVisibleDesktopCount] = useState(6);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [orderCode, setOrderCode] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const approvedReviews = useMemo(
    () => reviews.filter((r) => r.status !== 'hidden' && r.status !== 'pending'),
    [reviews],
  );

  const averageRating = useMemo(() => {
    if (approvedReviews.length === 0) return null;
    const sum = approvedReviews.reduce((acc, r) => acc + (r.rating ?? 5), 0);
    return (sum / approvedReviews.length).toFixed(1);
  }, [approvedReviews]);

  const visibleReviews = approvedReviews.slice(0, visibleDesktopCount);
  const remaining = approvedReviews.length - visibleReviews.length;

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitFeedback(null);
    setSubmitting(true);
    try {
      const res = await submitReviewApi({
        orderCode: orderCode.trim(),
        phoneLast4: phoneLast4.trim(),
        rating,
        comment: comment.trim(),
      });
      setSubmitFeedback({ type: 'success', message: res.message });
      setOrderCode('');
      setPhoneLast4('');
      setComment('');
      onReviewSubmitted?.();
    } catch (err) {
      setSubmitFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Slanje utiska nije uspelo.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-label="Utisci zadovoljnih kupaca"
      className="border-t border-[#E6E2D8] bg-white py-12 sm:py-16"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            {averageRating !== null && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#121212]">
                <div className="flex items-center gap-0.5 text-[#C5A059]" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-[#C5A059] text-[#C5A059]" />
                  ))}
                </div>
                <span className="tabular-nums">{averageRating}/5 ★</span>
                <span className="text-[#6B6862] font-normal tabular-nums">
                  • {approvedReviews.length} objavljenih utisaka
                </span>
              </div>
            )}

            <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#121212] mt-2 text-balance">
              Utisci kupaca
            </h2>
          </div>

          <div className="flex flex-col sm:items-end gap-2">
            <p className="text-xs sm:text-sm text-[#6B6862] max-w-md sm:text-right">
              Iskustva kupaca nakon isporuke — plaćanje pouzećem i autentični komadi sa
              etiketom.
            </p>
            <button
              type="button"
              onClick={() => {
                setSubmitFeedback(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-[#121212] bg-[#FAF9F6] hover:bg-[#121212] hover:text-white text-xs font-semibold text-[#121212] transition-colors cursor-pointer w-fit"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Ostavi utisak (za kupce)</span>
            </button>
          </div>
        </div>

        {/* Mobile Horizontal Swipeable Carousel */}
        <div className="md:hidden flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 -mx-4 px-4">
          {approvedReviews.map((review) => {
            const stars = Math.min(5, Math.max(1, review.rating ?? 5));
            return (
              <article
                key={review.id}
                className="snap-start shrink-0 w-[82vw] max-w-[320px] bg-[#FAF9F6] border border-[#E6E2D8] rounded-xl p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className="flex items-center gap-0.5 text-[#C5A059]"
                      aria-label={`Ocena ${stars} od 5`}
                    >
                      {Array.from({ length: stars }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-[#C5A059] text-[#C5A059]" />
                      ))}
                    </div>
                    {review.verifiedPurchase && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800">
                        <Check className="w-3 h-3" aria-hidden="true" />
                        Verifikovan kupac
                      </span>
                    )}
                  </div>

                  <p className="text-[13px] text-[#121212] leading-relaxed mt-3">
                    “{review.comment}”
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#EAE5DA]">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-[#121212] text-white text-[11px] font-semibold flex items-center justify-center">
                      {review.initials}
                    </span>
                    <span className="text-xs font-semibold text-[#121212]">
                      {review.name}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#6B6862]">{review.dateLabel}</span>
                </div>
              </article>
            );
          })}
        </div>

        {/* Desktop 3-Column Clean Grid */}
        <div className="hidden md:grid grid-cols-3 gap-5">
          {visibleReviews.map((review) => {
            const stars = Math.min(5, Math.max(1, review.rating ?? 5));
            return (
              <article
                key={review.id}
                className="bg-[#FAF9F6] border border-[#E6E2D8] rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className="flex items-center gap-0.5 text-[#C5A059]"
                      aria-label={`Ocena ${stars} od 5`}
                    >
                      {Array.from({ length: stars }).map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-[#C5A059] text-[#C5A059]" />
                      ))}
                    </div>
                    {review.verifiedPurchase && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800">
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        Verifikovan kupac
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-[#121212] leading-relaxed mt-3">
                    “{review.comment}”
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#EAE5DA]">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-[#121212] text-white text-xs font-semibold flex items-center justify-center">
                      {review.initials}
                    </span>
                    <span className="text-[13px] font-semibold text-[#121212]">
                      {review.name}
                    </span>
                  </div>
                  <span className="text-xs text-[#6B6862]">{review.dateLabel}</span>
                </div>
              </article>
            );
          })}
        </div>

        {/* Desktop Show More Button */}
        {remaining > 0 && (
          <div className="hidden md:flex justify-center mt-8">
            <button
              type="button"
              onClick={() =>
                setVisibleDesktopCount((prev) =>
                  Math.min(approvedReviews.length, prev + 6),
                )
              }
              className="h-11 px-7 rounded-full border border-[#121212] bg-white hover:bg-[#121212] hover:text-white text-sm font-semibold text-[#121212] transition-colors cursor-pointer tabular-nums"
            >
              Prikaži još utisaka ({Math.min(6, remaining)} od preostalih {remaining})
            </button>
          </div>
        )}
      </div>

      {/* Verified Post-Delivery Review Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ostavi verifikovan utisak kupca"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
        >
          <div
            className="absolute inset-0"
            onClick={() => setIsModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-[#FAF9F6] border border-[#E6E2D8] rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-white border-b border-[#E6E2D8] flex items-center justify-between">
              <div>
                <h3 className="font-editorial text-lg font-semibold text-[#121212]">
                  Ostavite utisak nakon kupovine
                </h3>
                <p className="text-[11px] text-[#6B6862]">
                  Dostupno za porudžbine sa statusom Isporučena
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Zatvori"
                className="w-9 h-9 rounded-full border border-[#E2DDD3] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitReview} className="p-5 space-y-3">
              {submitFeedback && (
                <div
                  role={submitFeedback.type === 'error' ? 'alert' : 'status'}
                  className={`p-3 rounded-xl text-xs font-medium ${
                    submitFeedback.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border border-rose-200 text-[#9F1239]'
                  }`}
                >
                  {submitFeedback.message}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#121212] mb-1">
                    Šifra porudžbine *
                  </label>
                  <input
                    type="text"
                    required
                    value={orderCode}
                    onChange={(e) => setOrderCode(e.target.value)}
                    placeholder="AO-2611-4821"
                    className="w-full h-10 px-3 bg-white border border-[#D8D2C5] rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#121212] mb-1">
                    Zadnje 4 cifre tel. *
                  </label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    maxLength={4}
                    value={phoneLast4}
                    onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="7890"
                    className="w-full h-10 px-3 bg-white border border-[#D8D2C5] rounded-xl text-xs tabular-nums"
                  />
                </div>
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-[#121212] mb-1">
                  Ocena (1–5)
                </span>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((starVal) => (
                    <button
                      key={starVal}
                      type="button"
                      onClick={() => setRating(starVal)}
                      aria-label={`Ocena ${starVal}`}
                      className="p-1.5 rounded-lg bg-white border border-[#E2DDD3] cursor-pointer"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          starVal <= rating
                            ? 'fill-[#C5A059] text-[#C5A059]'
                            : 'text-[#D2CCC0]'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#121212] mb-1">
                  Vaš komentar *
                </label>
                <textarea
                  required
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Kako ste zadovoljni kvalitetom, veličinom i brzinom dostave?"
                  className="w-full p-3 bg-white border border-[#D8D2C5] rounded-xl text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl bg-[#9F1239] hover:bg-[#881337] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {submitting ? 'Slanje...' : 'Pošalji utisak na odobrenje'}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
