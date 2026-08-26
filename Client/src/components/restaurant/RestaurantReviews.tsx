import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { getReviews, type Review } from "../../api.ts";

interface RestaurantReviewsProps {
    slug: string;
}

export default function RestaurantReviews({ slug }: RestaurantReviewsProps) {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const fetchReviews = async () => {
            try {
                const found = await getReviews(slug);
                if (!cancelled) setReviews(found);
            } catch {
                if (!cancelled) setReviews([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchReviews();
        return () => {
            cancelled = true;
        };
    }, [slug]);

    return (
        <section className="space-y-8 pt-6 border-t border-outline-variant/10 text-left">
            <h3 className="font-display text-xl font-semibold text-primary">Guest Experiences</h3>

            <div className="space-y-6">
                {loading ? (
                    <div className="flex justify-center py-6">
                        <div className="w-5 h-5 border-2 border-outline-variant/30 border-t-secondary rounded-full animate-spin"></div>
                    </div>
                ) : reviews.length === 0 ? (
                    <p className="text-xs text-black/55 italic">No reviews yet. Be the first to share your experience!</p>
                ) : (
                    reviews.map((r) => (
                        <div key={r._id} className="pb-6 border-b border-outline-variant/10 last:border-b-0 space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-medium text-primary">{r.userName}</h4>
                                    <span className="text-xs text-black/55">
                                        Visited {new Date(r.visitedDate).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="flex items-center gap-0.5 text-secondary">
                                    {[...Array(5)].map((_, i) => (
                                        <Star
                                            key={i}
                                            size={12}
                                            fill={i < r.rating ? "currentColor" : "none"}
                                            className={i < r.rating ? "" : "text-outline-variant"}
                                        />
                                    ))}
                                </div>
                            </div>
                            <p className="text-xs text-black/55 max-w-lg leading-relaxed">{r.comment}</p>
                        </div>
                    ))
                )}
            </div>
        </section>
    );
}
