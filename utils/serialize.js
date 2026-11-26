const { parseJson, toDateString, toTimeString } = require('./helpers');

const movie = (row) => row && ({
  id: row.id,
  title: row.title,
  slug: row.slug,
  description: row.description || '',
  genre: row.genre,
  genres: String(row.genre || '').split(',').map((g) => g.trim()).filter(Boolean),
  language: row.language,
  duration: row.duration_minutes,
  durationMinutes: row.duration_minutes,
  releaseDate: toDateString(row.release_date),
  posterUrl: row.poster_url,
  backdropUrl: row.backdrop_url,
  trailerUrl: row.trailer_url,
  rating: Number(row.rating || 0),
  certification: row.certification,
  cast: parseJson(row.cast_json, []),
  crew: parseJson(row.crew_json, {}),
  status: row.status,
  trending: Boolean(row.is_trending),
  featured: Boolean(row.is_featured),
  recommended: Boolean(row.is_recommended),
  reviewRating: row.avg_review_rating === undefined ? undefined : Number(row.avg_review_rating || 0),
  reviewCount: row.review_count === undefined ? undefined : Number(row.review_count || 0)
});

const theatre = (row) => row && ({
  id: row.id,
  name: row.name,
  address: row.address,
  city: row.city,
  state: row.state,
  pincode: row.pincode,
  phone: row.phone,
  facilities: parseJson(row.facilities, []),
  logoUrl: row.logo_url,
  status: row.status,
  ownerId: row.owner_id,
  screenCount: row.screen_count === undefined ? undefined : Number(row.screen_count)
});

const screen = (row) => row && ({
  id: row.id,
  theatreId: row.theatre_id,
  name: row.name,
  capacity: row.capacity,
  seatLayout: parseJson(row.seat_layout, {}),
  status: row.status
});

const show = (row) => row && ({
  id: row.id,
  movieId: row.movie_id,
  screenId: row.screen_id,
  movieTitle: row.movie_title,
  posterUrl: row.poster_url,
  certification: row.certification,
  language: row.movie_language,
  duration: row.duration_minutes,
  theatreId: row.theatre_id,
  theatreName: row.theatre_name,
  theatreAddress: row.theatre_address,
  city: row.theatre_city,
  screenName: row.screen_name,
  date: toDateString(row.show_date),
  time: toTimeString(row.show_time),
  silverPrice: Number(row.silver_price),
  goldPrice: Number(row.gold_price),
  premiumPrice: Number(row.premium_price),
  status: row.status,
  capacity: row.capacity === undefined ? undefined : Number(row.capacity),
  bookedSeats: row.booked_count === undefined ? undefined : Number(row.booked_count),
  availableSeats: row.capacity === undefined ? undefined : Math.max(0, Number(row.capacity) - Number(row.booked_count || 0) - Number(row.reserved_count || 0))
});

const booking = (row) => row && ({
  id: row.id,
  reference: row.booking_ref,
  userId: row.user_id,
  showId: row.show_id,
  status: row.status,
  seats: parseJson(row.seats_json, []),
  seatCount: row.seat_count,
  subtotal: Number(row.subtotal),
  convenienceFee: Number(row.convenience_fee),
  tax: Number(row.tax_amount),
  discount: Number(row.discount_amount),
  total: Number(row.total_amount),
  couponCode: row.coupon_code,
  paymentStatus: row.payment_status,
  expiresAt: row.expires_at,
  bookedAt: row.booked_at,
  createdAt: row.created_at,
  movieTitle: row.movie_title,
  posterUrl: row.poster_url,
  theatreName: row.theatre_name,
  theatreAddress: row.theatre_address,
  theatreCity: row.theatre_city,
  screenName: row.screen_name,
  showDate: toDateString(row.show_date),
  showTime: toTimeString(row.show_time)
});

module.exports = { movie, theatre, screen, show, booking };
