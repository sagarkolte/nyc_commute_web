
// Mock Schedule
const now = Math.floor(Date.now() / 1000);
const FERRY_SCHEDULE_MOCK = [
    { tripId: 'SCH_1', time: now + 300, status: 'Scheduled' }, // +5 mins
    { tripId: 'SCH_2', time: now + 1800, status: 'Scheduled' }, // +30 mins
    { tripId: 'SCH_3', time: now - 300, status: 'Scheduled' } // -5 mins (Should be removed if not matched)
];

const RT_TRIPS = [
    { time: now + 360 }, // +6 mins. Matches SCH_1 (diff 60s)
    { time: now + 3600 } // +60 mins. No match.
];

console.log(`Current Time: ${new Date(now * 1000).toLocaleTimeString()}`);
console.log('--- Initial Schedule ---');
FERRY_SCHEDULE_MOCK.forEach(t => console.log(`${t.tripId}: ${new Date(t.time * 1000).toLocaleTimeString()} (${t.status})`));

let arrivals = [...FERRY_SCHEDULE_MOCK];

console.log('\n--- Processing Real-time Updates ---');
RT_TRIPS.forEach((rt, idx) => {
    const arrivalTime = rt.time;
    // Hybrid Merge Logic
    const matchIdx = arrivals.findIndex(a => a.status === 'Scheduled' && Math.abs(a.time - arrivalTime) < 1200);

    if (matchIdx !== -1) {
        console.log(`MATCHED RT Trip ${idx} to ${arrivals[matchIdx].tripId}. Updating Time/Status.`);
        arrivals[matchIdx] = {
            ...arrivals[matchIdx],
            time: arrivalTime,
            status: 'Live',
            minutesUntil: Math.floor((arrivalTime - now) / 60)
        };
    } else {
        console.log(`NEW RT Trip ${idx} (No schedule match). Adding.`);
        arrivals.push({
            tripId: `RT_${idx}`,
            time: arrivalTime,
            status: 'Live',
            minutesUntil: Math.floor((arrivalTime - now) / 60)
        });
    }
});

console.log('\n--- Filtering Stale Schedules ---');
arrivals = arrivals.filter(a => {
    if (a.status === 'Scheduled') {
        const keep = a.time >= now;
        if (!keep) console.log(`Removing stale trip ${a.tripId}`);
        return keep;
    }
    return true;
});

// Sort
arrivals.sort((a, b) => a.time - b.time);

console.log('\n--- Final Comparison ---');
arrivals.forEach(a => {
    console.log(`${a.status.toUpperCase()}: ${new Date(a.time * 1000).toLocaleTimeString()} (in ${Math.floor((a.time - now) / 60)}m)`);
});
