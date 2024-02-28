export default `
attribute float displacement;
vec3 vLut[256] =vec3[](
    vec3(0.133123, 0.000123, 0.200123),
    vec3(0.137123, 0.000123, 0.203123),
    vec3(0.141123, 0.000123, 0.205123),
    vec3(0.145123, 0.000123, 0.208123),
    vec3(0.149123, 0.000123, 0.210123),
    vec3(0.153123, 0.000123, 0.213123),
    vec3(0.157123, 0.000123, 0.215123),
    vec3(0.161123, 0.000123, 0.218123),
    vec3(0.165123, 0.000123, 0.220123),
    vec3(0.169123, 0.000123, 0.223123),
    vec3(0.173123, 0.000123, 0.225123),
    vec3(0.176123, 0.000123, 0.228123),
    vec3(0.180123, 0.000123, 0.230123),
    vec3(0.184123, 0.000123, 0.233123),
    vec3(0.188123, 0.000123, 0.235123),
    vec3(0.192123, 0.000123, 0.238123),
    vec3(0.196123, 0.000123, 0.240123),
    vec3(0.200123, 0.000123, 0.243123),
    vec3(0.204123, 0.000123, 0.245123),
    vec3(0.208123, 0.000123, 0.248123),
    vec3(0.212123, 0.000123, 0.250123),
    vec3(0.220123, 0.000123, 0.255123),
    vec3(0.176123, 0.000123, 0.228123),
    vec3(0.180123, 0.000123, 0.230123),
    vec3(0.184123, 0.000123, 0.233123),
    vec3(0.188123, 0.000123, 0.235123),
    vec3(0.192123, 0.000123, 0.238123),
    vec3(0.196123, 0.000123, 0.240123),
    vec3(0.200123, 0.000123, 0.243123),
    vec3(0.204123, 0.000123, 0.245123),
    vec3(0.208123, 0.000123, 0.248123),
    vec3(0.212123, 0.000123, 0.250123),
    vec3(0.220123, 0.000123, 0.255123),
    vec3(0.135778, 0.046856, 0.299776),
    vec3(0.142378, 0.046242, 0.308553),
    vec3(0.149073, 0.045468, 0.317085),
    vec3(0.155850, 0.044559, 0.325338),
    vec3(0.162689, 0.043554, 0.333277),
    vec3(0.169575, 0.042489, 0.340874),
    vec3(0.176493, 0.041402, 0.348111),
    vec3(0.183429, 0.040329, 0.354971),
    vec3(0.190367, 0.039309, 0.361447),
    vec3(0.197297, 0.038400, 0.367535),
    vec3(0.204209, 0.037632, 0.373238),
    vec3(0.211095, 0.037030, 0.378563),
    vec3(0.217949, 0.036615, 0.383522),
    vec3(0.224763, 0.036405, 0.388129),
    vec3(0.231538, 0.036405, 0.392400),
    vec3(0.238273, 0.036621, 0.396353),
    vec3(0.244967, 0.037055, 0.400007),
    vec3(0.251620, 0.037705, 0.403378),
    vec3(0.258234, 0.038571, 0.406485),
    vec3(0.264810, 0.039647, 0.409345),
    vec3(0.271347, 0.040922, 0.411976),
    vec3(0.277850, 0.042353, 0.414392),
    vec3(0.284321, 0.043933, 0.416608),
    vec3(0.290763, 0.045644, 0.418637),
    vec3(0.297178, 0.047470, 0.420491),
    vec3(0.303568, 0.049396, 0.422182),
    vec3(0.309935, 0.051407, 0.423721),
    vec3(0.316282, 0.053490, 0.425116),
    vec3(0.322610, 0.055634, 0.426377),
    vec3(0.328921, 0.057827, 0.427511),
    vec3(0.335217, 0.060060, 0.428524),
    vec3(0.341500, 0.062325, 0.429425),
    vec3(0.347771, 0.064616, 0.430217),
    vec3(0.354032, 0.066925, 0.430906),
    vec3(0.360284, 0.069247, 0.431497),
    vec3(0.366529, 0.071579, 0.431994),
    vec3(0.372768, 0.073915, 0.432400),
    vec3(0.379001, 0.076253, 0.432719),
    vec3(0.385228, 0.078591, 0.432955),
    vec3(0.391453, 0.080927, 0.433109),
    vec3(0.397674, 0.083257, 0.433183),
    vec3(0.403894, 0.085580, 0.433179),
    vec3(0.410113, 0.087896, 0.433098),
    vec3(0.416331, 0.090203, 0.432943),
    vec3(0.422549, 0.092501, 0.432714),
    vec3(0.428768, 0.094790, 0.432412),
    vec3(0.434987, 0.097069, 0.432039),
    vec3(0.441207, 0.099338, 0.431594),
    vec3(0.447428, 0.101597, 0.431080),
    vec3(0.453651, 0.103848, 0.430498),
    vec3(0.459875, 0.106089, 0.429846),
    vec3(0.466100, 0.108322, 0.429125),
    vec3(0.472328, 0.110547, 0.428334),
    vec3(0.478558, 0.112764, 0.427475),
    vec3(0.484789, 0.114974, 0.426548),
    vec3(0.491022, 0.117179, 0.425552),
    vec3(0.497257, 0.119379, 0.424488),
    vec3(0.503493, 0.121575, 0.423356),
    vec3(0.509730, 0.123769, 0.422156),
    vec3(0.515967, 0.125960, 0.420887),
    vec3(0.522206, 0.128150, 0.419549),
    vec3(0.528444, 0.130341, 0.418142),
    vec3(0.534683, 0.132534, 0.416667),
    vec3(0.540920, 0.134729, 0.415123),
    vec3(0.547157, 0.136929, 0.413511),
    vec3(0.553392, 0.139134, 0.411829),
    vec3(0.559624, 0.141346, 0.410078),
    vec3(0.565854, 0.143567, 0.408258),
    vec3(0.572081, 0.145797, 0.406369),
    vec3(0.578304, 0.148039, 0.404411),
    vec3(0.584521, 0.150294, 0.402385),
    vec3(0.590734, 0.152563, 0.400290),
    vec3(0.596940, 0.154848, 0.398125),
    vec3(0.603139, 0.157151, 0.395891),
    vec3(0.609330, 0.159474, 0.393589),
    vec3(0.615513, 0.161817, 0.391219),
    vec3(0.621685, 0.164184, 0.388781),
    vec3(0.627847, 0.166575, 0.386276),
    vec3(0.633998, 0.168992, 0.383704),
    vec3(0.640135, 0.171438, 0.381065),
    vec3(0.646260, 0.173914, 0.378359),
    vec3(0.652369, 0.176421, 0.375586),
    vec3(0.658463, 0.178962, 0.372748),
    vec3(0.664540, 0.181539, 0.369846),
    vec3(0.670599, 0.184153, 0.366879),
    vec3(0.676638, 0.186807, 0.363849),
    vec3(0.682656, 0.189501, 0.360757),
    vec3(0.688653, 0.192239, 0.357603),
    vec3(0.694627, 0.195021, 0.354388),
    vec3(0.700576, 0.197851, 0.351113),
    vec3(0.706500, 0.200728, 0.347777),
    vec3(0.712396, 0.203656, 0.344383),
    vec3(0.718264, 0.206636, 0.340931),
    vec3(0.724103, 0.209670, 0.337424),
    vec3(0.729909, 0.212759, 0.333861),
    vec3(0.735683, 0.215906, 0.330245),
    vec3(0.741423, 0.219112, 0.326576),
    vec3(0.747127, 0.222378, 0.322856),
    vec3(0.752794, 0.225706, 0.319085),
    vec3(0.758422, 0.229097, 0.315266),
    vec3(0.764010, 0.232554, 0.311399),
    vec3(0.769556, 0.236077, 0.307485),
    vec3(0.775059, 0.239667, 0.303526),
    vec3(0.780517, 0.243327, 0.299523),
    vec3(0.785929, 0.247056, 0.295477),
    vec3(0.791293, 0.250856, 0.291390),
    vec3(0.796607, 0.254728, 0.287264),
    vec3(0.801871, 0.258674, 0.283099),
    vec3(0.807082, 0.262692, 0.278898),
    vec3(0.812239, 0.266786, 0.274661),
    vec3(0.817341, 0.270954, 0.270390),
    vec3(0.822386, 0.275197, 0.266085),
    vec3(0.827372, 0.279517, 0.261750),
    vec3(0.832299, 0.283913, 0.257383),
    vec3(0.837165, 0.288385, 0.252988),
    vec3(0.841969, 0.292933, 0.248564),
    vec3(0.846709, 0.297559, 0.244113),
    vec3(0.851384, 0.302260, 0.239636),
    vec3(0.855992, 0.307038, 0.235133),
    vec3(0.860533, 0.311892, 0.230606),
    vec3(0.865006, 0.316822, 0.226055),
    vec3(0.869409, 0.321827, 0.221482),
    vec3(0.873741, 0.326906, 0.216886),
    vec3(0.878001, 0.332060, 0.212268),
    vec3(0.882188, 0.337287, 0.207628),
    vec3(0.886302, 0.342586, 0.202968),
    vec3(0.890341, 0.347957, 0.198286),
    vec3(0.894305, 0.353399, 0.193584),
    vec3(0.898192, 0.358911, 0.188860),
    vec3(0.902003, 0.364492, 0.184116),
    vec3(0.905735, 0.370140, 0.179350),
    vec3(0.909390, 0.375856, 0.174563),
    vec3(0.912966, 0.381636, 0.169755),
    vec3(0.916462, 0.387481, 0.164924),
    vec3(0.919879, 0.393389, 0.160070),
    vec3(0.923215, 0.399359, 0.155193),
    vec3(0.926470, 0.405389, 0.150292),
    vec3(0.929644, 0.411479, 0.145367),
    vec3(0.932737, 0.417627, 0.140417),
    vec3(0.935747, 0.423831, 0.135440),
    vec3(0.938675, 0.430091, 0.130438),
    vec3(0.941521, 0.436405, 0.125409),
    vec3(0.944285, 0.442772, 0.120354),
    vec3(0.946965, 0.449191, 0.115272),
    vec3(0.949562, 0.455660, 0.110164),
    vec3(0.952075, 0.462178, 0.105031),
    vec3(0.954506, 0.468744, 0.099874),
    vec3(0.956852, 0.475356, 0.094695),
    vec3(0.959114, 0.482014, 0.089499),
    vec3(0.961293, 0.488716, 0.084289),
    vec3(0.963387, 0.495462, 0.079073),
    vec3(0.965397, 0.502249, 0.073859),
    vec3(0.967322, 0.509078, 0.068659),
    vec3(0.969163, 0.515946, 0.063488),
    vec3(0.970919, 0.522853, 0.058367),
    vec3(0.972590, 0.529798, 0.053324),
    vec3(0.974176, 0.536780, 0.048392),
    vec3(0.975677, 0.543798, 0.043618),
    vec3(0.977092, 0.550850, 0.039050),
    vec3(0.978422, 0.557937, 0.034931),
    vec3(0.979666, 0.565057, 0.031409),
    vec3(0.980824, 0.572209, 0.028508),
    vec3(0.981895, 0.579392, 0.026250),
    vec3(0.982881, 0.586606, 0.024661),
    vec3(0.983779, 0.593849, 0.023770),
    vec3(0.984591, 0.601122, 0.023606),
    vec3(0.985315, 0.608422, 0.024202),
    vec3(0.985952, 0.615750, 0.025592),
    vec3(0.986502, 0.623105, 0.027814),
    vec3(0.986964, 0.630485, 0.030908),
    vec3(0.987337, 0.637890, 0.034916),
    vec3(0.987622, 0.645320, 0.039886),
    vec3(0.987819, 0.652773, 0.045581),
    vec3(0.987926, 0.660250, 0.051750),
    vec3(0.987945, 0.667748, 0.058329),
    vec3(0.987874, 0.675267, 0.065257),
    vec3(0.987714, 0.682807, 0.072489),
    vec3(0.987464, 0.690366, 0.079990),
    vec3(0.987124, 0.697944, 0.087731),
    vec3(0.986694, 0.705540, 0.095694),
    vec3(0.986175, 0.713153, 0.103863),
    vec3(0.985566, 0.720782, 0.112229),
    vec3(0.984865, 0.728427, 0.120785),
    vec3(0.984075, 0.736087, 0.129527),
    vec3(0.983196, 0.743758, 0.138453),
    vec3(0.982228, 0.751442, 0.147565),
    vec3(0.981173, 0.759135, 0.156863),
    vec3(0.980032, 0.766837, 0.166353),
    vec3(0.978806, 0.774545, 0.176037),
    vec3(0.977497, 0.782258, 0.185923),
    vec3(0.976108, 0.789974, 0.196018),
    vec3(0.974638, 0.797692, 0.206332),
    vec3(0.973088, 0.805409, 0.216877),
    vec3(0.971468, 0.813122, 0.227658),
    vec3(0.969783, 0.820825, 0.238686),
    vec3(0.968041, 0.828515, 0.249972),
    vec3(0.966243, 0.836191, 0.261534),
    vec3(0.964394, 0.843848, 0.273391),
    vec3(0.962517, 0.851476, 0.285546),
    vec3(0.960626, 0.859069, 0.298010),
    vec3(0.958720, 0.866624, 0.310820),
    vec3(0.956834, 0.874129, 0.323974),
    vec3(0.954997, 0.881569, 0.337475),
    vec3(0.953215, 0.888942, 0.351369),
    vec3(0.951546, 0.896226, 0.365627),
    vec3(0.950018, 0.903409, 0.380271),
    vec3(0.948683, 0.910473, 0.395289),
    vec3(0.947594, 0.917399, 0.410665),
    vec3(0.946809, 0.924168, 0.426373),
    vec3(0.946392, 0.930761, 0.442367),
    vec3(0.946403, 0.937159, 0.458592),
    vec3(0.946903, 0.943348, 0.474970),
    vec3(0.947937, 0.949318, 0.491426),
    vec3(0.949545, 0.955063, 0.507860),
    vec3(0.951740, 0.960587, 0.524203),
    vec3(0.954529, 0.965896, 0.540361),
    vec3(0.957896, 0.971003, 0.556275),
    vec3(0.961812, 0.975924, 0.571925),
    vec3(0.966249, 0.980678, 0.587206),
    vec3(0.971162, 0.985282, 0.602154),
    vec3(0.976511, 0.989753, 0.616760),
    vec3(0.982257, 0.994109, 0.631017),
    vec3(0.988362, 0.998364, 0.644924)
);
varying vec3 vColor;
void main(){
int index = int(displacement);
    vColor = vLut[index];
vColor.x = (vColor.x*255.-19.)/206.;
vColor.y = (vColor.y*255.-30.)/236.;
vColor.z = (vColor.z*255.-15.)/190.;

vec3 osition = position + normal*displacement/25.5;
gl_Position = projectionMatrix * modelViewMatrix * vec4(osition,1.0);
}
`;
