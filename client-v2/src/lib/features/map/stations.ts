import type { Icon, IconOptions } from 'leaflet';

export interface FireStation {
	agency: string;
	station: number;
	name: string;
	latitude: number;
	longitude: number;
}

const ICON_SIZE: number = 20;

export const fireAgencies: Map<string, string> = new Map([
	['SLCFD', '/fire-icons/salt-lake-city.png'],
	['Draper', 'https://api.dicebear.com/9.x/initials/svg?seed=D&radius=50&backgroundColor=1e88e5'],
	['Sandy', 'https://api.dicebear.com/9.x/initials/svg?seed=S&radius=50&backgroundColor=e53935'],
	['SSL', 'https://api.dicebear.com/9.x/initials/svg?seed=SSL&radius=50&backgroundColor=8e24aa'],
	['WJ', 'https://api.dicebear.com/9.x/initials/svg?seed=WJ&radius=50&backgroundColor=f57c00'],
	['SJ', 'https://api.dicebear.com/9.x/initials/svg?seed=SJ&radius=50&backgroundColor=00897b'],
	['WV', 'https://api.dicebear.com/9.x/initials/svg?seed=WV&radius=50&backgroundColor=3949ab'],
	['Murray', 'https://api.dicebear.com/9.x/initials/svg?seed=M&radius=50&backgroundColor=c62828'],
	['Bluffdale', 'https://api.dicebear.com/9.x/initials/svg?seed=B&radius=50&backgroundColor=2e7d32'],
	['UFA', '/fire-icons/unified-fire-authority.png']
]);

export const fireStations: FireStation[] = [
	{ agency: 'SLCFD', station: 1, name: 'SLC 1', latitude: 40.764534, longitude: -111.876254 },
	{ agency: 'SLCFD', station: 2, name: 'SLC 2', latitude: 40.77625, longitude: -111.898683 },
	{ agency: 'SLCFD', station: 3, name: 'SLC 3', latitude: 40.722424, longitude: -111.859962 },
	{ agency: 'SLCFD', station: 4, name: 'SLC 4', latitude: 40.781382, longitude: -111.864448 },
	{ agency: 'SLCFD', station: 5, name: 'SLC 5', latitude: 40.7501, longitude: -111.861612 },
	{ agency: 'SLCFD', station: 6, name: 'SLC 6', latitude: 40.752276, longitude: -111.918758 },
	{ agency: 'SLCFD', station: 7, name: 'SLC 7', latitude: 40.775352, longitude: -111.920281 },
	{ agency: 'SLCFD', station: 8, name: 'SLC 8', latitude: 40.741332, longitude: -111.891619 },
	{ agency: 'SLCFD', station: 9, name: 'SLC 9', latitude: 40.778326, longitude: -112.028627 },
	{ agency: 'SLCFD', station: 10, name: 'SLC 10', latitude: 40.752192, longitude: -111.825959 },
	{ agency: 'SLCFD', station: 11, name: 'SLC 11', latitude: 40.782222, longitude: -111.957945 },
	{ agency: 'SLCFD', station: 12, name: 'SLC 12', latitude: 40.794032, longitude: -111.981544 },
	{ agency: 'SLCFD', station: 13, name: 'SLC 13', latitude: 40.723762, longitude: -111.822679 },
	{ agency: 'SLCFD', station: 14, name: 'SLC 14', latitude: 40.742001, longitude: -111.982873 },

	{ agency: 'Draper', station: 21, name: 'Draper 21', latitude: 40.526567, longitude: -111.869246 },
	{ agency: 'Draper', station: 22, name: 'Draper 22', latitude: 40.49164, longitude: -111.875885 },
	{ agency: 'Draper', station: 23, name: 'Draper 23', latitude: 40.480849, longitude: -111.83684 },

	{ agency: 'Sandy', station: 31, name: 'Sandy 31', latitude: 40.582612, longitude: -111.898796 },
	{ agency: 'Sandy', station: 32, name: 'Sandy 32', latitude: 40.578904, longitude: -111.833737 },
	{ agency: 'Sandy', station: 33, name: 'Sandy 33', latitude: 40.546381, longitude: -111.833417 },
	{ agency: 'Sandy', station: 34, name: 'Sandy 34', latitude: 40.555801, longitude: -111.871803 },
	{ agency: 'Sandy', station: 35, name: 'Sandy 35', latitude: 40.60261, longitude: -111.853598 },

	{ agency: 'SSL', station: 41, name: 'South Salt Lake 41', latitude: 40.71386, longitude: -111.891533 },
	{ agency: 'SSL', station: 42, name: 'South Salt Lake 42', latitude: 40.701053, longitude: -111.916534 },
	{ agency: 'SSL', station: 43, name: 'South Salt Lake 43', latitude: 40.692241, longitude: -111.894532 },

	{ agency: 'WJ', station: 52, name: 'West Jordan 52', latitude: 40.606923, longitude: -111.939338 },
	{ agency: 'WJ', station: 53, name: 'West Jordan 53', latitude: 40.613435, longitude: -111.984951 },
	{ agency: 'WJ', station: 54, name: 'West Jordan 54', latitude: 40.582133, longitude: -112.023661 },
	{ agency: 'WJ', station: 55, name: 'West Jordan 55', latitude: 40.61019, longitude: -112.043974 },

	{ agency: 'SJ', station: 61, name: 'South Jordan 61', latitude: 40.556063, longitude: -111.939209 },
	{ agency: 'SJ', station: 62, name: 'South Jordan 62', latitude: 40.562755, longitude: -111.986837 },
	{ agency: 'SJ', station: 63, name: 'South Jordan 63', latitude: 40.561451, longitude: -111.919763 },
	{ agency: 'SJ', station: 64, name: 'South Jordan 64', latitude: 40.545643, longitude: -112.020992 },

	{ agency: 'WV', station: 71, name: 'West Valley 71', latitude: 40.680723, longitude: -112.044212 },
	{ agency: 'WV', station: 72, name: 'West Valley 72', latitude: 40.682438, longitude: -111.994173 },
	{ agency: 'WV', station: 73, name: 'West Valley 73', latitude: 40.708379, longitude: -111.9588 },
	{ agency: 'WV', station: 74, name: 'West Valley 74', latitude: 40.703446, longitude: -112.023457 },
	{ agency: 'WV', station: 75, name: 'West Valley 75', latitude: 40.693185, longitude: -111.943844 },

	{ agency: 'Murray', station: 81, name: 'Murray 81', latitude: 40.666669, longitude: -111.892732 },
	{ agency: 'Murray', station: 82, name: 'Murray 82', latitude: 40.64106, longitude: -111.863016 },
	{ agency: 'Murray', station: 83, name: 'Murray 83', latitude: 40.643239, longitude: -111.903943 },

	{ agency: 'Bluffdale', station: 91, name: 'Bluffdale 91', latitude: 40.490781, longitude: -111.948929 },
	{ agency: 'Bluffdale', station: 92, name: 'Bluffdale 92', latitude: 40.480738, longitude: -111.919717 },

	{ agency: 'UFA', station: 101, name: 'UFA 101', latitude: 40.68701, longitude: -111.86891 },
	{ agency: 'UFA', station: 102, name: 'UFA 102', latitude: 40.71105008, longitude: -112.09775644 },
	{ agency: 'UFA', station: 103, name: 'UFA 103', latitude: 40.51424999, longitude: -112.0315083 },
	{ agency: 'UFA', station: 104, name: 'UFA 104', latitude: 40.67000211, longitude: -111.82581201 },
	{ agency: 'UFA', station: 106, name: 'UFA 106', latitude: 40.69994, longitude: -111.83702 },
	{ agency: 'UFA', station: 107, name: 'UFA 107', latitude: 40.63661894, longitude: -112.02437312 },
	{ agency: 'UFA', station: 108, name: 'UFA 108', latitude: 40.61108306, longitude: -111.58075542 },
	{ agency: 'UFA', station: 109, name: 'UFA 109', latitude: 40.6528661, longitude: -111.99686812 },
	{ agency: 'UFA', station: 110, name: 'UFA 110', latitude: 40.62474876, longitude: -111.84103883 },
	{ agency: 'UFA', station: 111, name: 'UFA 111', latitude: 40.69642061, longitude: -112.08753759 },
	{ agency: 'UFA', station: 112, name: 'UFA 112', latitude: 40.68623934, longitude: -111.79339687 },
	{ agency: 'UFA', station: 113, name: 'UFA 113', latitude: 40.58373234, longitude: -111.65414735 },
	{ agency: 'UFA', station: 115, name: 'UFA 115', latitude: 40.56605132, longitude: -112.09354694 },
	{ agency: 'UFA', station: 116, name: 'UFA 116', latitude: 40.60028875, longitude: -111.79684915 },
	{ agency: 'UFA', station: 117, name: 'UFA 117', latitude: 40.67164177, longitude: -111.93869645 },
	{ agency: 'UFA', station: 118, name: 'UFA 118', latitude: 40.65485299, longitude: -111.95778806 },
	{ agency: 'UFA', station: 119, name: 'UFA 119', latitude: 40.770006, longitude: -111.759992 },
	{ agency: 'UFA', station: 120, name: 'UFA 120', latitude: 40.5149583, longitude: -111.95779867 },
	{ agency: 'UFA', station: 121, name: 'UFA 121', latitude: 40.5223521, longitude: -111.98892566 },
	{ agency: 'UFA', station: 123, name: 'UFA 123', latitude: 40.4857, longitude: -112.0066 },
	{ agency: 'UFA', station: 124, name: 'UFA 124', latitude: 40.52105527, longitude: -111.92940362 },
	{ agency: 'UFA', station: 125, name: 'UFA 125', latitude: 40.6106269, longitude: -111.90878637 },
	{ agency: 'UFA', station: 126, name: 'UFA 126', latitude: 40.62081388, longitude: -111.87436333 },
	{ agency: 'UFA', station: 127, name: 'UFA 127', latitude: 40.43853, longitude: -111.92403 },
	{ agency: 'UFA', station: 251, name: 'UFA 251', latitude: 40.30133513, longitude: -112.0149478 },
	{ agency: 'UFA', station: 252, name: 'UFA 252', latitude: 40.36291528, longitude: -111.97152239 },
	{ agency: 'UFA', station: 253, name: 'UFA 253', latitude: 40.33235279, longitude: -112.02070676 }
];

export function getIcon(leafletLib: { icon: (options: IconOptions) => Icon }, station: FireStation) {
	if (!leafletLib) return;

	const url = fireAgencies.get(station.agency);
	if (url != undefined) {
		return leafletLib.icon({
			iconUrl: url,
			iconSize: [ICON_SIZE, ICON_SIZE],
			iconAnchor: [12, 12],
			popupAnchor: [0, -14]
		});
	}

	return leafletLib.icon({
		iconUrl: '/fire-icons/unknown.png',
		iconSize: [ICON_SIZE, ICON_SIZE],
		iconAnchor: [12, 12],
		popupAnchor: [0, -14]
	});
}
