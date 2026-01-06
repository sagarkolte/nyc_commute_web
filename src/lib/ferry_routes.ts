
// Static definitions of NYC Ferry Routes and their Stop Sequences
// Used for inferring Route ID from sparse real-time feed data.

export const FERRY_ROUTES: Record<string, string[]> = {
    // Wall St -> E 34th
    'East River': [
        '87', // Wall St/Pier 11
        '20', // Dumbo
        '8',  // S Williamsburg
        '19', // N Williamsburg
        '18', // Greenpoint
        '4',  // Hunters Point South
        '17'  // E 34th St
    ],
    // Rockaway -> Wall St
    'Rockaway': [
        '104', // Rockaway Park (Beach 108th) - Summer/Shuttle?
        '88', // Rockaway (Beach 108th)
        '46', // Beach 41st ?? Check IDs. Using primary headers.
        '118', // Sunset Park
        '87'  // Wall St
    ],
    // Astoria -> Wall St
    'Astoria': [
        '113', // E 90th St
        '89',  // Astoria
        '25',  // Roosevelt Island
        '90',  // DEC/Long Island City
        '17',  // E 34th St
        '120', // Brooklyn Navy Yard
        '87'   // Wall St
    ],
    // South Brooklyn -> Wall St
    'South Brooklyn': [
        '115', // Corlears Hook
        '20',  // Dumbo
        '87',  // Wall St
        '11',  // Atlantic Ave/Pier 6
        '24',  // Red Hook
        '118', // Sunset Park
        '23'   // Bay Ridge
    ],
    // Soundview -> Wall St
    'Soundview': [
        '141', // Ferry Point Park
        '112', // Soundview
        '113', // E 90th St
        '114', // Stuyvesant Cove
        '17',  // E 34th St
        '87'   // Wall St
    ],
    // St George -> West Midtown
    'St. George': [
        '137', // St George
        '136', // Battery Park City
        '138'  // Midtown West
    ],
    // Coney Island (If active)
    'Coney Island': [
        '307', // Coney Island
        '23',  // Bay Ridge
        '87'   // Wall St
    ]
};

// Map of Route Name to internal code if needed, but we'll use the names directly for now.
// The feed sends empty route_id, so we just infer "East River" or "Astoria" and match that.
